import { describe, expect, it, vi } from 'vitest';
import { generateTasksAndReminders, reminderStagesForTask } from './task-generator.js';

describe('generateTasksAndReminders feature switch', () => {
  it('扫描计划时排除已软删除猫咪，但保留公共计划', async () => {
    const now = new Date('2026-07-12T00:00:00Z');
    const prisma = {
      idempotencyRecord: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
      plan: { findMany: vi.fn().mockResolvedValue([]) },
      task: { findMany: vi.fn() },
    };

    await generateTasksAndReminders(prisma as never, { add: vi.fn() } as never, now, {
      notificationsEnabled: false,
    });

    expect(prisma.plan.findMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        enabled: true,
        deletedAt: null,
        AND: expect.arrayContaining([{ OR: [{ petId: null }, { pet: { deletedAt: null } }] }]),
      }),
    });
  });

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
      family: { timezone: 'Asia/Shanghai' },
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

  it('queues due and same-day overdue reminder stages', async () => {
    const now = new Date('2026-07-12T00:00:00Z');
    const task = {
      id: 'task-id',
      familyId: 'family-id',
      petId: 'pet-id',
      assigneeId: 'user-id',
      title: '喂药',
      type: 'MEDICATION',
      scheduledAt: new Date('2026-07-12T01:00:00Z'),
      family: { timezone: 'Asia/Shanghai' },
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

    await expect(generateTasksAndReminders(prisma as never, queue as never, now)).resolves.toEqual(
      expect.objectContaining({ remindersQueued: 4 }),
    );

    expect(queue.add).toHaveBeenCalledTimes(4);
    expect(queue.add.mock.calls.map((call) => call[2]?.jobId)).toEqual([
      'notify__task-id__user-id__DEVELOPMENT__due',
      'notify__task-id__user-id__DEVELOPMENT__overdue-1',
      'notify__task-id__user-id__DEVELOPMENT__overdue-2',
      'notify__task-id__user-id__DEVELOPMENT__overdue-3',
    ]);
    expect(queue.add.mock.calls.map((call) => call[1]?.jobKey)).toEqual([
      'notify:task-id:user-id:DEVELOPMENT:due',
      'notify:task-id:user-id:DEVELOPMENT:overdue-1',
      'notify:task-id:user-id:DEVELOPMENT:overdue-2',
      'notify:task-id:user-id:DEVELOPMENT:overdue-3',
    ]);
    expect(queue.add.mock.calls.map((call) => call[2]?.delay)).toEqual([
      60 * 60 * 1000,
      90 * 60 * 1000,
      120 * 60 * 1000,
      150 * 60 * 1000,
    ]);
  });

  it('does not queue overdue stages after the task local day ends', () => {
    const stages = reminderStagesForTask(
      new Date('2026-07-12T15:45:00Z'),
      'Asia/Shanghai',
      new Date('2026-07-12T15:30:00Z'),
    );

    expect(stages.map((item) => item.stage)).toEqual(['due']);
  });

  it('respects overdue reminder preferences for personal push deliveries', async () => {
    const now = new Date('2026-07-12T00:00:00Z');
    const task = {
      id: 'task-id',
      familyId: 'family-id',
      petId: 'pet-id',
      assigneeId: 'user-id',
      title: '驱虫',
      type: 'DEWORMING',
      scheduledAt: new Date('2026-07-12T01:00:00Z'),
      family: { timezone: 'Asia/Shanghai' },
    };
    const prisma = {
      idempotencyRecord: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
      plan: { findMany: vi.fn().mockResolvedValue([]) },
      task: { findMany: vi.fn().mockResolvedValue([task]) },
      membership: { findMany: vi.fn().mockResolvedValue([{ userId: 'user-id' }]) },
      notificationPreference: {
        findMany: vi.fn().mockResolvedValue([
          {
            userId: 'user-id',
            taskReminderEnabled: true,
            pushEnabled: true,
            overdueEnabled: false,
          },
        ]),
      },
      devicePushToken: {
        findMany: vi
          .fn()
          .mockResolvedValue([
            { id: 'token-id', userId: 'user-id', token: 'ExponentPushToken[t]' },
          ]),
      },
      notificationChannel: { findUnique: vi.fn().mockResolvedValue(null) },
      notificationLog: { upsert: vi.fn().mockResolvedValue({}) },
    };
    const queue = { add: vi.fn().mockResolvedValue({ id: 'job-id' }) };

    await generateTasksAndReminders(prisma as never, queue as never, now);

    expect(queue.add).toHaveBeenCalledTimes(1);
    expect(queue.add.mock.calls[0]?.[2]?.jobId).toBe('notify__task-id__token-id__EXPO_PUSH__due');
    expect(queue.add.mock.calls[0]?.[1]?.jobKey).toBe('notify:task-id:token-id:EXPO_PUSH:due');
  });
});
