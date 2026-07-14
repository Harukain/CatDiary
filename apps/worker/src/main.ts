import { PrismaClient } from '@prisma/client';
import { Queue, Worker } from 'bullmq';
import { redisConnectionFromUrl } from '@cat-diary/domain';
import { generateTasksAndReminders } from './task-generator.js';
import { cleanupPhotoObjects, photoStorageConfigFromEnvironment } from './photo-cleanup.js';
import { processAccountDeletions } from './account-cleanup.js';
import {
  buildExport,
  cleanupExpiredExports,
  exportStorageFromEnvironment,
} from './export-builder.js';
import { validateWorkerEnvironment } from './environment.js';
import { processExpoReceipt } from './expo-receipt.js';
import { createOperationsServer, WorkerMetrics } from './operations-server.js';
import { deliverNotificationDue } from './notification-delivery.js';

const environment = validateWorkerEnvironment(process.env);
const connection = redisConnectionFromUrl(environment.REDIS_URL);
const prisma = new PrismaClient();
const schedulerQueue = new Queue('cat-diary-scheduler', { connection });
const notificationQueue = new Queue('cat-diary-notifications', { connection });
const exportQueue = new Queue('cat-diary-exports', { connection });
const metrics = new WorkerMetrics();

async function bootstrap() {
  await schedulerQueue.upsertJobScheduler(
    'task-generation-every-15-minutes',
    { every: 15 * 60 * 1000 },
    { name: 'task-generator', data: {} },
  );
  await schedulerQueue.add(
    'task-generator',
    {},
    { jobId: `startup-${Date.now()}`, removeOnComplete: 20 },
  );
  await schedulerQueue.upsertJobScheduler(
    'photo-cleanup-daily',
    { every: 24 * 60 * 60 * 1000 },
    { name: 'photo-cleanup', data: {} },
  );

  const schedulerWorker = new Worker(
    'cat-diary-scheduler',
    async (job) => {
      if (job.name === 'task-generator')
        return generateTasksAndReminders(prisma, notificationQueue, new Date(), {
          notificationsEnabled: environment.FEATURE_NOTIFICATIONS_ENABLED,
        });
      if (job.name === 'photo-cleanup') {
        const [photos, accounts, exports] = await Promise.all([
          cleanupPhotoObjects(prisma, photoStorageConfigFromEnvironment()),
          processAccountDeletions(prisma),
          cleanupExpiredExports(prisma, exportStorageFromEnvironment()),
        ]);
        return { photos, accounts, exports };
      }
      return { ignored: true };
    },
    { connection, concurrency: 1 },
  );

  const notificationWorker = new Worker(
    'cat-diary-notifications',
    async (job) => {
      if (job.name === 'expo-receipt') return processExpoReceipt(prisma, job.data);
      if (job.name !== 'notification-due') return { ignored: true };
      const jobKey = job.id ?? `unknown-${job.data.id}`;
      const result = await deliverNotificationDue(prisma, {
        jobKey,
        attemptsMade: job.attemptsMade,
        data: job.data,
      });
      if (result.skipped) return result;
      const { delivery } = result;
      if (delivery.channel === 'EXPO_PUSH' && delivery.providerMessageId) {
        await notificationQueue.add(
          'expo-receipt',
          {
            notificationLogId: result.notificationLogId,
            receiptId: delivery.providerMessageId,
            pushTokenId: job.data.pushTokenId,
          },
          {
            jobId: `${jobKey}-receipt`,
            delay: 15 * 60 * 1000,
            attempts: 6,
            backoff: { type: 'exponential', delay: 5 * 60 * 1000 },
            removeOnComplete: { age: 10 * 24 * 60 * 60, count: 10_000 },
            removeOnFail: { age: 30 * 24 * 60 * 60, count: 10_000 },
          },
        );
      }
      return { channel: delivery.channel, sentAt: new Date().toISOString() };
    },
    {
      connection,
      concurrency: 5,
      autorun: environment.FEATURE_NOTIFICATIONS_ENABLED,
    },
  );
  const exportWorker = new Worker(
    'cat-diary-exports',
    async (job) => {
      if (job.name !== 'build-export' || typeof job.data.exportId !== 'string')
        return { ignored: true };
      return buildExport(prisma, job.data.exportId, exportStorageFromEnvironment());
    },
    { connection, concurrency: 2, autorun: environment.FEATURE_EXPORTS_ENABLED },
  );

  const operationsServer = createOperationsServer({
    prisma,
    queues: [
      { name: 'scheduler', queue: schedulerQueue },
      { name: 'notifications', queue: notificationQueue },
      { name: 'exports', queue: exportQueue },
    ],
    metrics,
    metricsToken: environment.METRICS_TOKEN,
    features: {
      notifications: environment.FEATURE_NOTIFICATIONS_ENABLED,
      exports: environment.FEATURE_EXPORTS_ENABLED,
    },
  });
  await new Promise<void>((resolve, reject) => {
    operationsServer.once('error', reject);
    operationsServer.listen(environment.WORKER_PORT, environment.WORKER_HOST, () => {
      operationsServer.off('error', reject);
      resolve();
    });
  });

  schedulerWorker.on('completed', (job) => metrics.record('scheduler', job, 'completed'));
  schedulerWorker.on('failed', (job) => job && metrics.record('scheduler', job, 'failed'));
  notificationWorker.on('completed', (job) => metrics.record('notifications', job, 'completed'));
  notificationWorker.on('failed', (job) => job && metrics.record('notifications', job, 'failed'));
  exportWorker.on('completed', (job) => metrics.record('exports', job, 'completed'));
  exportWorker.on('failed', (job) => job && metrics.record('exports', job, 'failed'));

  for (const worker of [schedulerWorker, notificationWorker, exportWorker]) {
    worker.on('failed', (job, error) =>
      console.error(
        JSON.stringify({
          level: 'error',
          service: 'cat-diary-worker',
          jobId: job?.id,
          message: error.message,
        }),
      ),
    );
  }
  notificationWorker.on('failed', (job, error) => {
    if (!job?.id) return;
    if (job.name === 'expo-receipt') {
      const attempts = job.opts.attempts ?? 1;
      if (job.attemptsMade < attempts || typeof job.data.notificationLogId !== 'string') return;
      void prisma.notificationLog.updateMany({
        where: { id: job.data.notificationLogId, status: 'SENT' },
        data: {
          status: 'FAILED',
          receiptCheckedAt: new Date(),
          errorCode: 'EXPO_RECEIPT_CHECK_FAILED',
          errorMessageSafe: error.message.slice(0, 300),
        },
      });
      return;
    }
    void prisma.notificationLog.updateMany({
      where: { jobKey: job.id },
      data: {
        status: 'FAILED',
        attempt: job.attemptsMade + 1,
        errorCode: `${String(job.data.channel ?? 'UNKNOWN')}_SEND_FAILED`,
        errorMessageSafe: error.message.slice(0, 300),
      },
    });
  });
  schedulerWorker.on('ready', () =>
    console.info(JSON.stringify({ level: 'info', service: 'cat-diary-worker', status: 'ready' })),
  );

  let shuttingDown = false;
  async function shutdown() {
    if (shuttingDown) return;
    shuttingDown = true;
    await Promise.all([
      schedulerWorker.close(),
      notificationWorker.close(),
      exportWorker.close(),
      schedulerQueue.close(),
      notificationQueue.close(),
      exportQueue.close(),
      new Promise<void>((resolve, reject) =>
        operationsServer.close((error) => (error ? reject(error) : resolve())),
      ),
    ]);
    await prisma.$disconnect();
  }
  process.on('SIGTERM', () => void shutdown());
  process.on('SIGINT', () => void shutdown());
}

void bootstrap().catch((error: Error) => {
  console.error(
    JSON.stringify({
      level: 'error',
      service: 'cat-diary-worker',
      event: 'startup-failed',
      message: error.message,
    }),
  );
  process.exitCode = 1;
});
