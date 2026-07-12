import type { PrismaClient } from '@prisma/client';
import type { Job, Queue } from 'bullmq';
import { timingSafeEqual } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import { collectDefaultMetrics, Counter, Gauge, Histogram, Registry } from 'prom-client';

const queueStates = ['waiting', 'active', 'delayed', 'failed', 'completed', 'paused'] as const;

export class WorkerMetrics {
  readonly registry = new Registry();
  readonly jobs = new Counter({
    name: 'cat_diary_worker_jobs_total',
    help: 'Total Worker jobs by queue, name and outcome',
    labelNames: ['queue', 'name', 'outcome'] as const,
    registers: [this.registry],
  });
  readonly duration = new Histogram({
    name: 'cat_diary_worker_job_duration_seconds',
    help: 'Worker job processing duration in seconds',
    labelNames: ['queue', 'name', 'outcome'] as const,
    buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 15, 30, 60],
    registers: [this.registry],
  });
  readonly queueJobs = new Gauge({
    name: 'cat_diary_worker_queue_jobs',
    help: 'Current BullMQ jobs by queue and state',
    labelNames: ['queue', 'state'] as const,
    registers: [this.registry],
  });

  constructor() {
    collectDefaultMetrics({ prefix: 'cat_diary_worker_', register: this.registry });
  }

  record(queue: string, job: Job, outcome: 'completed' | 'failed') {
    this.jobs.inc({ queue, name: job.name, outcome });
    if (job.processedOn) {
      const finishedOn = job.finishedOn ?? Date.now();
      this.duration.observe(
        { queue, name: job.name, outcome },
        Math.max(0, finishedOn - job.processedOn) / 1000,
      );
    }
  }

  async refreshQueues(queues: ReadonlyArray<{ name: string; queue: Queue }>) {
    await Promise.all(
      queues.map(async ({ name, queue }) => {
        const counts = await queue.getJobCounts(...queueStates);
        for (const state of queueStates)
          this.queueJobs.set({ queue: name, state }, counts[state] ?? 0);
      }),
    );
  }
}

interface OperationsServerOptions {
  prisma: Pick<PrismaClient, '$queryRawUnsafe'>;
  queues: ReadonlyArray<{ name: string; queue: Queue }>;
  metrics: WorkerMetrics;
  metricsToken: string;
  features?: { notifications: boolean; exports: boolean };
}

export function createOperationsServer(options: OperationsServerOptions): Server {
  return createServer(async (request, response) => {
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    response.setHeader('Cache-Control', 'no-store');
    if (request.method !== 'GET') return send(response, 405, { error: 'METHOD_NOT_ALLOWED' });
    if (request.url === '/health/live')
      return send(response, 200, {
        status: 'ok',
        service: 'cat-diary-worker',
        timestamp: new Date().toISOString(),
      });
    if (request.url === '/health/ready') {
      const startedAt = Date.now();
      try {
        await Promise.all([
          options.prisma.$queryRawUnsafe('SELECT 1'),
          ...options.queues.map(({ queue }) => queue.getJobCounts('waiting')),
        ]);
        return send(response, 200, {
          status: 'ready',
          service: 'cat-diary-worker',
          dependencies: { postgres: 'ok', redis: 'ok' },
          features: options.features ?? { notifications: true, exports: true },
          latencyMs: Date.now() - startedAt,
          timestamp: new Date().toISOString(),
        });
      } catch {
        return send(response, 503, {
          status: 'not-ready',
          service: 'cat-diary-worker',
          error: 'DEPENDENCY_UNAVAILABLE',
        });
      }
    }
    if (request.url === '/metrics') {
      const customHeader = request.headers['x-metrics-token'];
      const authorization = request.headers.authorization;
      const supplied =
        typeof customHeader === 'string'
          ? customHeader
          : typeof authorization === 'string'
            ? authorization.match(/^Bearer\s+(.+)$/i)?.[1]
            : undefined;
      if (typeof supplied !== 'string' || !safeEqual(supplied, options.metricsToken))
        return send(response, 401, { error: 'UNAUTHORIZED' });
      try {
        await options.metrics.refreshQueues(options.queues);
        response.statusCode = 200;
        response.setHeader('Content-Type', options.metrics.registry.contentType);
        response.end(await options.metrics.registry.metrics());
        return;
      } catch {
        return send(response, 503, { error: 'METRICS_UNAVAILABLE' });
      }
    }
    return send(response, 404, { error: 'NOT_FOUND' });
  });
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function send(response: import('node:http').ServerResponse, status: number, body: unknown) {
  response.statusCode = status;
  response.end(JSON.stringify(body));
}
