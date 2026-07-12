import { describe, expect, it } from 'vitest';
import { parseQueueOperation, runQueueOperation } from './queue-operations.js';

describe('parseQueueOperation', () => {
  it('uses all queues for read-only status by default', () => {
    expect(parseQueueOperation(['status'])).toEqual({
      command: 'status',
      queues: ['scheduler', 'notifications', 'exports'],
    });
    expect(parseQueueOperation(['--', 'status', '--queue', 'exports'])).toEqual({
      command: 'status',
      queues: ['exports'],
    });
  });

  it('requires exact confirmation for mutating operations', () => {
    expect(() => parseQueueOperation(['pause', '--queue', 'notifications'])).toThrow(
      /PAUSE:notifications/,
    );
    expect(
      parseQueueOperation([
        'pause',
        '--queue',
        'notifications',
        '--confirm',
        'PAUSE:notifications',
      ]),
    ).toEqual({ command: 'pause', queues: ['notifications'] });
  });

  it('rejects unknown queues and mismatched confirmations', () => {
    expect(() => parseQueueOperation(['status', '--queue', 'emails'])).toThrow(/Unknown queue/);
    expect(() =>
      parseQueueOperation(['resume', '--queue', 'all', '--confirm', 'RESUME:exports']),
    ).toThrow(/RESUME:all/);
  });

  it('pauses the selected global queue and reports its resulting state', async () => {
    let paused = false;
    const queue = {
      pause: async () => {
        paused = true;
      },
      resume: async () => {
        paused = false;
      },
      isPaused: async () => paused,
      getJobCounts: async () => ({ waiting: 3, active: 0 }),
      close: async () => undefined,
    };

    const result = await runQueueOperation(
      { command: 'pause', queues: ['notifications'] },
      'rediss://cache.internal/2',
      () => queue,
    );

    expect(result.results).toEqual([
      { queue: 'notifications', paused: true, counts: { waiting: 3, active: 0 } },
    ]);
  });
});
