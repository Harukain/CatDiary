import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createOperationsServer, WorkerMetrics } from './operations-server';

const servers: ReturnType<typeof createOperationsServer>[] = [];

afterEach(async () => {
  await Promise.all(
    servers
      .splice(0)
      .map((server) => new Promise<void>((resolve) => server.close(() => resolve()))),
  );
});

async function fixture(databaseReady = true) {
  const metrics = new WorkerMetrics();
  const queue = {
    getJobCounts: vi.fn().mockResolvedValue({
      waiting: 2,
      active: 1,
      delayed: 3,
      failed: 4,
      completed: 5,
      paused: 0,
    }),
  };
  const prisma = {
    $queryRawUnsafe: databaseReady
      ? vi.fn().mockResolvedValue([{ '?column?': 1 }])
      : vi.fn().mockRejectedValue(new Error('database unavailable')),
  };
  const server = createOperationsServer({
    prisma: prisma as never,
    queues: [{ name: 'notifications', queue: queue as never }],
    metrics,
    metricsToken: 'test-metrics-token-at-least-32-characters',
    features: { notifications: false, exports: true },
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as AddressInfo).port;
  return { base: `http://127.0.0.1:${port}`, queue };
}

describe('Worker operations server', () => {
  it('reports liveness and dependency readiness independently', async () => {
    const healthy = await fixture();
    expect((await fetch(`${healthy.base}/health/live`)).status).toBe(200);
    const ready = await fetch(`${healthy.base}/health/ready`);
    expect(ready.status).toBe(200);
    expect(await ready.json()).toMatchObject({
      dependencies: { postgres: 'ok', redis: 'ok' },
      features: { notifications: false, exports: true },
    });

    const unhealthy = await fixture(false);
    expect((await fetch(`${unhealthy.base}/health/live`)).status).toBe(200);
    expect((await fetch(`${unhealthy.base}/health/ready`)).status).toBe(503);
  });

  it('protects metrics and exports BullMQ queue depth', async () => {
    const { base } = await fixture();
    expect((await fetch(`${base}/metrics`)).status).toBe(401);
    const response = await fetch(`${base}/metrics`, {
      headers: { 'X-Metrics-Token': 'test-metrics-token-at-least-32-characters' },
    });
    const body = await response.text();
    expect(response.status).toBe(200);
    expect(body).toContain('cat_diary_worker_queue_jobs');
    expect(body).toContain('queue="notifications",state="failed"} 4');

    const bearer = await fetch(`${base}/metrics`, {
      headers: { Authorization: 'Bearer test-metrics-token-at-least-32-characters' },
    });
    expect(bearer.status).toBe(200);
  });
});
