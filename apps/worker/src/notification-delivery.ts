import type { NotificationChannelType, PrismaClient } from '@prisma/client';
import { sendNotification, type NotificationJobData } from './notification-sender.js';

type NotificationSender = typeof sendNotification;

type SkipReason =
  | 'LOG_NOT_FOUND'
  | 'LOG_NOT_SENDABLE'
  | 'TASK_NOT_FOUND'
  | 'TASK_NOT_PENDING'
  | 'TASK_DELETED'
  | 'PET_DELETED'
  | 'RECIPIENT_LEFT_FAMILY'
  | 'NOTIFICATION_PREFERENCE_DISABLED';

interface DeliveryGuardAllowed {
  allowed: true;
  notificationLogId: string;
}

interface DeliveryGuardSkipped {
  allowed: false;
  reason: SkipReason;
  notificationLogId?: string;
}

type DeliveryGuardResult = DeliveryGuardAllowed | DeliveryGuardSkipped;

const sendableLogStatuses = ['QUEUED', 'FAILED'] as const;

const skipMessages: Record<Exclude<SkipReason, 'LOG_NOT_FOUND' | 'LOG_NOT_SENDABLE'>, string> = {
  TASK_NOT_FOUND: '原任务已不存在，提醒已取消',
  TASK_NOT_PENDING: '任务已被处理，提醒已取消',
  TASK_DELETED: '任务已删除，提醒已取消',
  PET_DELETED: '猫咪档案已删除，提醒已取消',
  RECIPIENT_LEFT_FAMILY: '接收人已不在当前家庭，提醒已取消',
  NOTIFICATION_PREFERENCE_DISABLED: '接收人已关闭对应提醒',
};

/**
 * Re-checks mutable task, pet, membership and preference state immediately before delivery.
 * A BullMQ job can remain queued long after any of those resources changed, so enqueue-time
 * validation alone is not a safe authorization or lifecycle boundary.
 */
export async function guardNotificationDelivery(
  prisma: PrismaClient,
  jobKey: string,
): Promise<DeliveryGuardResult> {
  const log = await prisma.notificationLog.findUnique({
    where: { jobKey },
    select: {
      id: true,
      familyId: true,
      userId: true,
      channel: true,
      status: true,
      task: {
        select: {
          id: true,
          familyId: true,
          petId: true,
          status: true,
          deletedAt: true,
          pet: { select: { deletedAt: true } },
        },
      },
    },
  });
  if (!log) return { allowed: false, reason: 'LOG_NOT_FOUND' };
  if (!sendableLogStatuses.includes(log.status as (typeof sendableLogStatuses)[number]))
    return { allowed: false, reason: 'LOG_NOT_SENDABLE', notificationLogId: log.id };

  let reason: Exclude<SkipReason, 'LOG_NOT_FOUND' | 'LOG_NOT_SENDABLE'> | null = null;
  if (!log.task || log.task.familyId !== log.familyId) reason = 'TASK_NOT_FOUND';
  else if (log.task.deletedAt) reason = 'TASK_DELETED';
  else if (log.task.status !== 'PENDING') reason = 'TASK_NOT_PENDING';
  else if (log.task.petId && (!log.task.pet || log.task.pet.deletedAt)) reason = 'PET_DELETED';

  if (!reason && log.userId) {
    const [activeMembership, preference] = await Promise.all([
      prisma.membership.count({
        where: { familyId: log.familyId, userId: log.userId, status: 'ACTIVE' },
      }),
      prisma.notificationPreference.findUnique({
        where: { familyId_userId: { familyId: log.familyId, userId: log.userId } },
        select: { taskReminderEnabled: true, pushEnabled: true },
      }),
    ]);
    if (!activeMembership) reason = 'RECIPIENT_LEFT_FAMILY';
    else if (
      preference?.taskReminderEnabled === false ||
      (isPushLike(log.channel) && preference?.pushEnabled === false)
    )
      reason = 'NOTIFICATION_PREFERENCE_DISABLED';
  }

  if (!reason) return { allowed: true, notificationLogId: log.id };
  await prisma.notificationLog.updateMany({
    where: { id: log.id, status: { in: [...sendableLogStatuses] } },
    data: {
      status: 'SKIPPED',
      errorCode: `DELIVERY_${reason}`,
      errorMessageSafe: skipMessages[reason],
    },
  });
  return { allowed: false, reason, notificationLogId: log.id };
}

export async function deliverNotificationDue(
  prisma: PrismaClient,
  input: {
    jobKey: string;
    attemptsMade: number;
    data: NotificationJobData;
  },
  sender: NotificationSender = sendNotification,
) {
  const guard = await guardNotificationDelivery(prisma, input.jobKey);
  if (!guard.allowed) return { skipped: true as const, reason: guard.reason };

  const delivery = await sender(prisma, input.data);
  await prisma.notificationLog.updateMany({
    where: { jobKey: input.jobKey, status: { in: [...sendableLogStatuses] } },
    data: {
      status: 'SENT',
      attempt: input.attemptsMade + 1,
      sentAt: new Date(),
      providerMessageId: delivery.providerMessageId,
      errorCode: null,
      errorMessageSafe: null,
    },
  });
  return {
    skipped: false as const,
    delivery,
    notificationLogId: guard.notificationLogId,
  };
}

function isPushLike(channel: NotificationChannelType) {
  return channel === 'EXPO_PUSH' || channel === 'DEVELOPMENT';
}
