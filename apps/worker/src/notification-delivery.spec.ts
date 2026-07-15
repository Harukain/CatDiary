import type { PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { deliverNotificationDue, notificationFailureLogData } from './notification-delivery';

const jobData = {
  id: '11111111-1111-4111-8111-111111111111',
  familyId: '22222222-2222-4222-8222-222222222222',
  title: '喂药',
  scheduledAt: '2026-07-15T08:30:00.000Z',
  channel: 'EXPO_PUSH' as const,
  pushToken: 'ExponentPushToken[test]',
};

interface LogFixture {
  id: string;
  familyId: string;
  userId: string | null;
  channel: 'DEVELOPMENT' | 'EXPO_PUSH' | 'FEISHU';
  status: 'QUEUED' | 'FAILED' | 'SENT' | 'DELIVERED' | 'SKIPPED';
  task: {
    id: string;
    familyId: string;
    petId: string | null;
    status: 'PENDING' | 'COMPLETED' | 'SKIPPED' | 'CANCELLED';
    deletedAt: Date | null;
    pet: { deletedAt: Date | null } | null;
  } | null;
}

const pendingLog = {
  id: '33333333-3333-4333-8333-333333333333',
  familyId: jobData.familyId,
  userId: '44444444-4444-4444-8444-444444444444',
  channel: 'EXPO_PUSH' as const,
  status: 'QUEUED' as const,
  task: {
    id: jobData.id,
    familyId: jobData.familyId,
    petId: '55555555-5555-4555-8555-555555555555',
    status: 'PENDING' as const,
    deletedAt: null,
    pet: { deletedAt: null },
  },
} satisfies LogFixture;

function fakePrisma(
  overrides: {
    log?: LogFixture | null;
    activeMembership?: number;
    preference?: {
      taskReminderEnabled: boolean;
      pushEnabled: boolean;
      overdueEnabled?: boolean;
    } | null;
  } = {},
) {
  const notificationLog = {
    findUnique: vi
      .fn()
      .mockResolvedValue(
        Object.prototype.hasOwnProperty.call(overrides, 'log') ? overrides.log : pendingLog,
      ),
    updateMany: vi.fn().mockResolvedValue({ count: 1 }),
  };
  const membership = {
    count: vi.fn().mockResolvedValue(overrides.activeMembership ?? 1),
  };
  const notificationPreference = {
    findUnique: vi
      .fn()
      .mockResolvedValue(
        Object.prototype.hasOwnProperty.call(overrides, 'preference')
          ? overrides.preference
          : { taskReminderEnabled: true, pushEnabled: true, overdueEnabled: true },
      ),
  };
  return {
    prisma: { notificationLog, membership, notificationPreference } as unknown as PrismaClient,
    notificationLog,
    membership,
    notificationPreference,
  };
}

function input() {
  return { jobKey: 'notify:test', attemptsMade: 0, data: jobData };
}

describe('deliverNotificationDue', () => {
  it('sends a current pending task and records SENT only after the guard passes', async () => {
    const { prisma, notificationLog } = fakePrisma();
    const sender = vi
      .fn()
      .mockResolvedValue({ channel: 'EXPO_PUSH', providerMessageId: 'expo-ticket' });

    const result = await deliverNotificationDue(prisma, input(), sender);

    expect(result).toMatchObject({ skipped: false, notificationLogId: pendingLog.id });
    expect(sender).toHaveBeenCalledOnce();
    expect(notificationLog.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'SENT', attempt: 1 }) }),
    );
  });

  it('records a safe FAILED log before rethrowing provider send failures', async () => {
    const { prisma, notificationLog } = fakePrisma();
    const sender = vi
      .fn()
      .mockRejectedValue(new Error('EXPO_PUSH_REJECTED:ExponentPushToken[secret] should not leak'));

    await expect(
      deliverNotificationDue(prisma, { ...input(), attemptsMade: 2 }, sender),
    ).rejects.toThrow(/EXPO_PUSH_REJECTED/);

    expect(notificationLog.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { jobKey: input().jobKey, status: { in: ['QUEUED', 'FAILED'] } },
        data: expect.objectContaining({
          status: 'FAILED',
          attempt: 3,
          errorCode: 'EXPO_PUSH_REJECTED',
          errorMessageSafe: 'Expo 推送服务拒绝发送，请检查设备 Token 或推送凭据',
        }),
      }),
    );
  });

  it('does not expose raw provider details in safe failure messages', () => {
    const failure = notificationFailureLogData(
      'FEISHU',
      new Error('FEISHU_REJECTED:https://open.feishu.cn/open-apis/bot/v2/hook/secret'),
    );

    expect(failure).toEqual({
      errorCode: 'FEISHU_REJECTED',
      errorMessageSafe: '飞书机器人拒绝消息，请检查 Webhook 是否仍有效',
    });
  });

  it.each([
    [
      '已完成任务',
      { ...pendingLog, task: { ...pendingLog.task, status: 'COMPLETED' as const } },
      'TASK_NOT_PENDING',
    ],
    [
      '已软删除任务',
      { ...pendingLog, task: { ...pendingLog.task, deletedAt: new Date() } },
      'TASK_DELETED',
    ],
    [
      '已软删除猫咪',
      {
        ...pendingLog,
        task: { ...pendingLog.task, pet: { deletedAt: new Date() } },
      },
      'PET_DELETED',
    ],
  ])('跳过%s，不调用外部发送', async (_label, log, reason) => {
    const { prisma, notificationLog } = fakePrisma({ log });
    const sender = vi.fn();

    const result = await deliverNotificationDue(prisma, input(), sender);

    expect(result).toEqual({ skipped: true, reason });
    expect(sender).not.toHaveBeenCalled();
    expect(notificationLog.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'SKIPPED', errorCode: `DELIVERY_${reason}` }),
      }),
    );
  });

  it('接收人离开家庭后跳过并标记 SKIPPED', async () => {
    const { prisma, notificationLog } = fakePrisma({ activeMembership: 0 });
    const sender = vi.fn();

    const result = await deliverNotificationDue(prisma, input(), sender);

    expect(result).toEqual({ skipped: true, reason: 'RECIPIENT_LEFT_FAMILY' });
    expect(sender).not.toHaveBeenCalled();
    expect(notificationLog.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'SKIPPED' }) }),
    );
  });

  it.each([
    ['taskReminderEnabled', { taskReminderEnabled: false, pushEnabled: true }],
    ['pushEnabled', { taskReminderEnabled: true, pushEnabled: false }],
    ['overdueEnabled', { taskReminderEnabled: true, pushEnabled: true, overdueEnabled: false }],
  ])('用户关闭 %s 后跳过并不调用外部发送', async (_field, preference) => {
    const { prisma, notificationLog } = fakePrisma({ preference });
    const sender = vi.fn();
    const jobKey =
      _field === 'overdueEnabled' ? 'notify:task-id:user-id:EXPO_PUSH:overdue-1' : input().jobKey;

    const result = await deliverNotificationDue(prisma, { ...input(), jobKey }, sender);

    expect(result).toEqual({ skipped: true, reason: 'NOTIFICATION_PREFERENCE_DISABLED' });
    expect(sender).not.toHaveBeenCalled();
    expect(notificationLog.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'SKIPPED' }) }),
    );
  });

  it('家庭级飞书通知保持无个人接收人的既有行为', async () => {
    const log = { ...pendingLog, userId: null, channel: 'FEISHU' as const };
    const data = { ...jobData, channel: 'FEISHU' as const, channelId: 'channel-id' };
    const { prisma, membership, notificationPreference } = fakePrisma({ log });
    const sender = vi.fn().mockResolvedValue({ channel: 'FEISHU', providerMessageId: null });

    const result = await deliverNotificationDue(
      prisma,
      { jobKey: 'notify:feishu', attemptsMade: 0, data },
      sender,
    );

    expect(result).toMatchObject({ skipped: false });
    expect(sender).toHaveBeenCalledOnce();
    expect(membership.count).not.toHaveBeenCalled();
    expect(notificationPreference.findUnique).not.toHaveBeenCalled();
  });
});
