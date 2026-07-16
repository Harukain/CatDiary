import { NotificationChannelType, NotificationStatus } from '@prisma/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NotificationsService } from './notifications.service';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('NotificationsService retry', () => {
  it('rejects retries while the notification incident switch is disabled', async () => {
    const service = new NotificationsService(
      {} as never,
      {
        get: vi.fn((key: string, fallback?: unknown) =>
          key === 'FEATURE_NOTIFICATIONS_ENABLED' ? false : (fallback ?? 'redis://localhost:6379'),
        ),
      } as never,
      {} as never,
    );

    await expect(service.retry('family-id', 'log-id')).rejects.toMatchObject({
      code: 'NOTIFICATIONS_TEMPORARILY_DISABLED',
      status: 503,
    });
    await service.onModuleDestroy();
  });

  it('resends a receipt-failed push with the latest active device token', async () => {
    const log = {
      id: 'log-id',
      familyId: 'family-id',
      userId: 'user-id',
      jobKey: 'notify:task-id:old-token-id:EXPO_PUSH:overdue-1',
      channel: NotificationChannelType.EXPO_PUSH,
      status: NotificationStatus.FAILED,
      task: {
        id: 'task-id',
        familyId: 'family-id',
        title: '猫三联疫苗',
        scheduledAt: new Date('2026-07-13T02:00:00.000Z'),
      },
    };
    const prisma = {
      notificationLog: {
        findFirst: vi.fn().mockResolvedValue(log),
        update: vi.fn().mockImplementation(({ data }) => Promise.resolve({ ...log, ...data })),
      },
      devicePushToken: {
        findFirst: vi
          .fn()
          .mockResolvedValue({ id: 'new-token-id', token: 'ExponentPushToken[new]' }),
      },
      membership: { count: vi.fn().mockResolvedValue(1) },
      notificationChannel: { findUnique: vi.fn() },
    };
    const oldJob = { getState: vi.fn().mockResolvedValue('completed'), remove: vi.fn() };
    const receiptJob = { remove: vi.fn() };
    const queue = {
      getJob: vi.fn().mockResolvedValueOnce(oldJob).mockResolvedValueOnce(receiptJob),
      add: vi.fn().mockResolvedValue({ id: log.jobKey }),
      close: vi.fn(),
    };
    const service = new NotificationsService(
      prisma as never,
      { get: vi.fn().mockReturnValue('redis://localhost:6379') } as never,
      {} as never,
    );
    (service as unknown as { queue: typeof queue }).queue = queue;

    const result = await service.retry(log.familyId, log.id);

    expect(result.status).toBe(NotificationStatus.QUEUED);
    expect(queue.add).toHaveBeenCalledWith(
      'notification-due',
      expect.objectContaining({
        pushToken: 'ExponentPushToken[new]',
        pushTokenId: 'new-token-id',
        stage: 'overdue-1',
        jobKey: log.jobKey,
      }),
      expect.objectContaining({ jobId: 'notify__task-id__old-token-id__EXPO_PUSH__overdue-1' }),
    );
    expect(queue.getJob).toHaveBeenNthCalledWith(
      1,
      'notify__task-id__old-token-id__EXPO_PUSH__overdue-1',
    );
    expect(queue.getJob).toHaveBeenNthCalledWith(
      2,
      'notify__task-id__old-token-id__EXPO_PUSH__overdue-1__receipt',
    );
    expect(receiptJob.remove).toHaveBeenCalledOnce();
    expect(oldJob.remove).toHaveBeenCalledOnce();
    expect(prisma.devicePushToken.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          active: true,
          deviceSession: expect.objectContaining({ revokedAt: null }),
        }),
      }),
    );
    expect(prisma.notificationLog.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: NotificationStatus.QUEUED,
          receiptCheckedAt: null,
          providerMessageId: null,
        }),
      }),
    );
  });

  it('refuses to resend a failed push to a member who left the family', async () => {
    const log = {
      id: 'log-id',
      familyId: 'family-id',
      userId: 'former-user-id',
      jobKey: 'reminder-task-push-former-member',
      channel: NotificationChannelType.EXPO_PUSH,
      status: NotificationStatus.FAILED,
      task: { id: 'task-id', familyId: 'family-id', title: '铲屎', scheduledAt: new Date() },
    };
    const service = new NotificationsService(
      {
        notificationLog: { findFirst: vi.fn().mockResolvedValue(log) },
        membership: { count: vi.fn().mockResolvedValue(0) },
      } as never,
      { get: vi.fn().mockReturnValue('redis://localhost:6379') } as never,
      {} as never,
    );
    (
      service as unknown as {
        queue: { getJob: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn> };
      }
    ).queue = {
      getJob: vi.fn(),
      close: vi.fn(),
    };

    await expect(service.retry('family-id', 'log-id')).rejects.toMatchObject({
      code: 'NOTIFICATION_RECIPIENT_LEFT_FAMILY',
      status: 410,
    });
    await service.onModuleDestroy();
  });
});

describe('NotificationsService current device push test', () => {
  it('rejects test push while the notification incident switch is disabled', async () => {
    const service = new NotificationsService(
      {} as never,
      {
        get: vi.fn((key: string, fallback?: unknown) =>
          key === 'FEATURE_NOTIFICATIONS_ENABLED' ? false : (fallback ?? 'redis://localhost:6379'),
        ),
      } as never,
      {} as never,
    );

    await expect(
      service.testCurrentDevicePush('family-id', 'user-id', 'session-id'),
    ).rejects.toMatchObject({
      code: 'NOTIFICATIONS_TEMPORARILY_DISABLED',
      status: 503,
    });
    await service.onModuleDestroy();
  });

  it('requires the user push preference to be enabled', async () => {
    const service = new NotificationsService(
      {
        notificationPreference: {
          findUnique: vi.fn().mockResolvedValue({ pushEnabled: false }),
        },
      } as never,
      { get: vi.fn().mockReturnValue('redis://localhost:6379') } as never,
      {} as never,
    );

    await expect(
      service.testCurrentDevicePush('family-id', 'user-id', 'session-id'),
    ).rejects.toMatchObject({
      code: 'PUSH_PREFERENCE_DISABLED',
      status: 422,
    });
    await service.onModuleDestroy();
  });

  it('sends a test push to the active token bound to the current device session', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ data: { status: 'ok', id: 'expo-ticket-id' } }),
      }),
    );
    const prisma = {
      notificationPreference: {
        findUnique: vi.fn().mockResolvedValue({ pushEnabled: true }),
      },
      devicePushToken: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'token-id',
          token: 'ExponentPushToken[current-device]',
        }),
        update: vi.fn(),
      },
    };
    const service = new NotificationsService(
      prisma as never,
      { get: vi.fn().mockReturnValue('redis://localhost:6379') } as never,
      {} as never,
    );

    const result = await service.testCurrentDevicePush('family-id', 'user-id', 'session-id');

    expect(result).toMatchObject({ success: true, providerMessageId: 'expo-ticket-id' });
    expect(prisma.devicePushToken.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: 'user-id',
          deviceSessionId: 'session-id',
          active: true,
          provider: 'EXPO',
          deviceSession: expect.objectContaining({ revokedAt: null }),
        }),
      }),
    );
    expect(fetch).toHaveBeenCalledWith(
      'https://exp.host/--/api/v2/push/send',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('猫伴日记测试通知'),
      }),
    );
    await service.onModuleDestroy();
  });

  it('deactivates a stale current-device token when Expo reports DeviceNotRegistered', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          data: { status: 'error', details: { error: 'DeviceNotRegistered' } },
        }),
      }),
    );
    const prisma = {
      notificationPreference: {
        findUnique: vi.fn().mockResolvedValue({ pushEnabled: true }),
      },
      devicePushToken: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'token-id',
          token: 'ExponentPushToken[stale]',
        }),
        update: vi.fn(),
      },
    };
    const service = new NotificationsService(
      prisma as never,
      { get: vi.fn().mockReturnValue('redis://localhost:6379') } as never,
      {} as never,
    );

    await expect(
      service.testCurrentDevicePush('family-id', 'user-id', 'session-id'),
    ).rejects.toMatchObject({
      code: 'PUSH_TOKEN_NOT_DELIVERABLE',
      status: 422,
    });
    expect(prisma.devicePushToken.update).toHaveBeenCalledWith({
      where: { id: 'token-id' },
      data: { active: false },
    });
    await service.onModuleDestroy();
  });
});
