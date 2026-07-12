import { describe, expect, it, vi } from 'vitest';
import { generateTasksAndReminders } from './task-generator.js';

describe('generateTasksAndReminders feature switch', () => {
  it('continues task generation but does not read or enqueue reminders when disabled', async () => {
    const prisma = {
      idempotencyRecord: { deleteMany: vi.fn().mockResolvedValue({ count: 2 }) },
      plan: { findMany: vi.fn().mockResolvedValue([]) },
      task: { findMany: vi.fn() },
    };
    const queue = { add: vi.fn() };

    await expect(
      generateTasksAndReminders(prisma as never, queue as never, new Date('2026-07-12T00:00:00Z'), {
        notificationsEnabled: false,
      }),
    ).resolves.toEqual({
      plansScanned: 0,
      tasksGenerated: 0,
      remindersQueued: 0,
      notificationsEnabled: false,
      expiredIdempotencyCleaned: 2,
    });
    expect(prisma.task.findMany).not.toHaveBeenCalled();
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('only selects push tokens backed by an active unexpired device session', async () => {
    const now = new Date('2026-07-12T00:00:00Z');
    const task = {
      id: 'task-id',
      familyId: 'family-id',
      petId: 'pet-id',
      assigneeId: 'user-id',
      title: '铲屎',
      type: 'LITTER',
      scheduledAt: new Date('2026-07-12T01:00:00Z'),
    };
    const prisma = {
      idempotencyRecord: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
      plan: { findMany: vi.fn().mockResolvedValue([]) },
      task: { findMany: vi.fn().mockResolvedValue([task]) },
      membership: { findMany: vi.fn().mockResolvedValue([{ userId: 'user-id' }]) },
      notificationPreference: { findMany: vi.fn().mockResolvedValue([]) },
      devicePushToken: { findMany: vi.fn().mockResolvedValue([]) },
      notificationChannel: { findUnique: vi.fn().mockResolvedValue(null) },
      notificationLog: { upsert: vi.fn().mockResolvedValue({}) },
    };
    const queue = { add: vi.fn().mockResolvedValue({ id: 'job-id' }) };

    await generateTasksAndReminders(prisma as never, queue as never, now);

    expect(prisma.devicePushToken.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          active: true,
          deviceSession: { revokedAt: null, expiresAt: { gt: now } },
        }),
      }),
    );
  });
});
