import { spawn } from 'node:child_process';

const apiPort = process.env.PORT ?? '3000';
const workerPort = process.env.WORKER_PORT ?? '3001';
const apiBaseUrl = process.env.CATDIARY_API_BASE_URL ?? `http://127.0.0.1:${apiPort}/api/v1`;
const workerBaseUrl = `http://127.0.0.1:${workerPort}`;

const env = {
  ...process.env,
  NODE_ENV: 'test',
  PORT: apiPort,
  WORKER_PORT: workerPort,
  DATABASE_URL:
    process.env.DATABASE_URL ??
    'postgresql://catdiary:catdiary@127.0.0.1:5433/catdiary?schema=public',
  REDIS_URL: process.env.REDIS_URL ?? 'redis://127.0.0.1:6379',
  JWT_ACCESS_SECRET: 'integration-access-secret-at-least-32-characters',
  JWT_REFRESH_SECRET: 'integration-refresh-secret-at-least-32-characters',
  PHONE_LOOKUP_SECRET: 'integration-phone-lookup-secret-at-least-32',
  PHONE_ENCRYPTION_SECRET: 'integration-phone-encryption-secret-32-chars',
  CHANNEL_ENCRYPTION_SECRET: 'integration-channel-encryption-secret-32-chars',
  DEV_OTP_CODE: '123456',
  DEFAULT_TIMEZONE: 'Asia/Shanghai',
  PUBLIC_API_URL: apiBaseUrl,
  CATDIARY_API_BASE_URL: apiBaseUrl,
  UPLOAD_LOCAL_DIR: '/tmp/cat-diary-integration/uploads',
  EXPORT_LOCAL_DIR: '/tmp/cat-diary-integration/exports',
  THROTTLE_DEFAULT_LIMIT: '10000',
  THROTTLE_SMS_SEND_LIMIT: '10000',
  THROTTLE_SMS_VERIFY_LIMIT: '10000',
  METRICS_TOKEN: 'integration-metrics-token-at-least-32-characters',
};
const processes = [];
function start(args) {
  const child = spawn('pnpm', args, { env, stdio: 'inherit' });
  processes.push(child);
  return child;
}
function run(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(args[0], args.slice(1), { env, stdio: 'inherit' });
    child.once('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`${args.join(' ')} exited ${code}`)),
    );
  });
}
async function waitForApi() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`${apiBaseUrl}/health/ready`);
      if (response.ok) {
        if (response.headers.get('x-content-type-options') !== 'nosniff')
          throw new Error('Helmet content type protection is missing');
        if (response.headers.get('x-frame-options') !== 'SAMEORIGIN')
          throw new Error('Helmet frame protection is missing');
        const requestId = response.headers.get('x-request-id');
        if (!requestId) throw new Error('X-Request-Id is missing');
        const deniedMetrics = await fetch(`${apiBaseUrl}/metrics`);
        if (deniedMetrics.status !== 401) throw new Error('Metrics endpoint is not protected');
        const metrics = await fetch(`${apiBaseUrl}/metrics`, {
          headers: { 'X-Metrics-Token': env.METRICS_TOKEN },
        });
        const metricsBody = await metrics.text();
        if (!metrics.ok || !metricsBody.includes('cat_diary_http_requests_total'))
          throw new Error('Prometheus metrics are unavailable');
        return;
      }
    } catch {
      // API may still be compiling or opening dependency connections.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error('API readiness timeout');
}
async function waitForWorker() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const live = await fetch(`${workerBaseUrl}/health/live`);
      const ready = await fetch(`${workerBaseUrl}/health/ready`);
      const deniedMetrics = await fetch(`${workerBaseUrl}/metrics`);
      const metrics = await fetch(`${workerBaseUrl}/metrics`, {
        headers: { 'X-Metrics-Token': env.METRICS_TOKEN },
      });
      const metricsBody = await metrics.text();
      if (
        live.ok &&
        ready.ok &&
        deniedMetrics.status === 401 &&
        metrics.ok &&
        metricsBody.includes('cat_diary_worker_queue_jobs')
      )
        return;
    } catch {
      // Worker may still be opening queues and dependency connections.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error('Worker readiness timeout');
}
async function main() {
  await run(['pnpm', 'exec', 'prisma', 'migrate', 'deploy']);
  await run(['pnpm', 'exec', 'prisma', 'migrate', 'status']);
  start(['--filter', '@cat-diary/api', 'start']);
  start(['--filter', '@cat-diary/worker', 'start']);
  try {
    await waitForApi();
    await waitForWorker();
    for (const script of [
      'verify-openapi.mjs',
      'verify-otp-store.mjs',
      'verify-records.mjs',
      'verify-pet-profile.mjs',
      'verify-health-events.mjs',
      'verify-medical-records.mjs',
      'verify-m3-e2e.mjs',
      'verify-photos.mjs',
      'verify-preferences-account.mjs',
      'verify-session-push-tokens.mjs',
      'verify-family-reminder-boundary.mjs',
      'verify-task-concurrency.mjs',
      'verify-api-performance.mjs',
      'verify-exports.mjs',
    ])
      await run(['node', `scripts/${script}`]);
  } finally {
    for (const child of processes) child.kill('SIGTERM');
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
