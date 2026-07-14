import type { PrismaClient } from '@prisma/client';
import type { Queue } from 'bullmq';
import {
  generateOccurrences,
  TASK_GENERATION_WINDOW_DAYS,
  type RecurrenceRule,
} from '@cat-diary/domain';

export async function generateTasksAndReminders(
  prisma: PrismaClient,
  notificationQueue: Queue,
  now = new Date(),
  options: { notificationsEnabled?: boolean } = {},
) {
  const expiredIdempotency = await prisma.idempotencyRecord.deleteMany({
    where: { expiresAt: { lte: now } },
  });
  const horizon = new Date(now.getTime() + TASK_GENERATION_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const plans = await prisma.plan.findMany({
    where: {
      enabled: true,
      deletedAt: null,
      startAt: { lte: horizon },
      AND: [
        { OR: [{ endAt: null }, { endAt: { gte: now } }] },
        { OR: [{ petId: null }, { pet: { deletedAt: null } }] },
      ],
    },
  });
  let generated = 0;
  for (const plan of plans) {
    const occurrences = generateOccurrences({
      startAt: plan.startAt,
      endAt: plan.endAt,
      timezone: plan.timezone,
      localTime: plan.localTime,
      rule: plan.recurrenceRule as unknown as RecurrenceRule,
      from: now,
      to: horizon,
    });
    if (!occurrences.length) continue;
    const result = await prisma.task.createMany({
      data: occurrences.map((scheduledAt) => ({
        familyId: plan.familyId,
        petId: plan.petId,
        planId: plan.id,
        createdById: plan.createdById,
        assigneeId: plan.assigneeId,
        title: plan.title,
        detail: plan.detail,
        type: plan.recordType,
        scheduledAt,
      })),
      skipDuplicates: true,
    });
    generated += result.count;
  }

  const pendingTasks =
    options.notificationsEnabled === false
      ? []
      : await prisma.task.findMany({
          where: { status: 'PENDING', deletedAt: null, scheduledAt: { gte: now, lte: horizon } },
          select: {
            id: true,
            familyId: true,
            petId: true,
            assigneeId: true,
            title: true,
            type: true,
            scheduledAt: true,
          },
        });
  let remindersQueued = 0;
  for (const task of pendingTasks) {
    const remindAt = new Date(task.scheduledAt.getTime() - 30 * 60 * 1000);
    const activeMemberIds = (
      await prisma.membership.findMany({
        where: { familyId: task.familyId, status: 'ACTIVE' },
        select: { userId: true },
      })
    ).map((item) => item.userId);
    const recipientIds =
      task.assigneeId && activeMemberIds.includes(task.assigneeId)
        ? [task.assigneeId]
        : activeMemberIds;
    const preferences = await prisma.notificationPreference.findMany({
      where: { familyId: task.familyId, userId: { in: recipientIds } },
      select: { userId: true, taskReminderEnabled: true, pushEnabled: true },
    });
    const preferenceByUser = new Map(
      preferences.map((preference) => [preference.userId, preference]),
    );
    const pushRecipientIds = recipientIds.filter((userId) => {
      const preference = preferenceByUser.get(userId);
      return preference?.taskReminderEnabled !== false && preference?.pushEnabled !== false;
    });
    const pushTokens = await prisma.devicePushToken.findMany({
      where: {
        userId: { in: pushRecipientIds },
        active: true,
        provider: 'EXPO',
        deviceSession: { revokedAt: null, expiresAt: { gt: now } },
      },
      select: { id: true, userId: true, token: true },
    });
    const feishu = await prisma.notificationChannel.findUnique({
      where: { familyId_type: { familyId: task.familyId, type: 'FEISHU' } },
      select: { id: true, enabled: true },
    });
    const deliveries: Array<{
      jobKey: string;
      channel: 'DEVELOPMENT' | 'EXPO_PUSH' | 'FEISHU';
      userId: string | null;
      data: Record<string, unknown>;
    }> = [];
    for (const token of pushTokens) {
      deliveries.push({
        jobKey: `${reminderJobId(task.id, task.scheduledAt)}-push-${token.id}`,
        channel: 'EXPO_PUSH',
        userId: token.userId,
        data: {
          ...task,
          channel: 'EXPO_PUSH',
          pushToken: token.token,
          pushTokenId: token.id,
        },
      });
    }
    if (feishu?.enabled) {
      deliveries.push({
        jobKey: `${reminderJobId(task.id, task.scheduledAt)}-feishu`,
        channel: 'FEISHU',
        userId: null,
        data: { ...task, channel: 'FEISHU', channelId: feishu.id },
      });
    }
    if (!deliveries.length && pushRecipientIds.length) {
      deliveries.push({
        jobKey: reminderJobId(task.id, task.scheduledAt),
        channel: 'DEVELOPMENT',
        userId: pushRecipientIds.length === 1 ? (pushRecipientIds[0] ?? null) : null,
        data: { ...task, channel: 'DEVELOPMENT' },
      });
    }
    for (const delivery of deliveries) {
      await prisma.notificationLog.upsert({
        where: { jobKey: delivery.jobKey },
        create: {
          jobKey: delivery.jobKey,
          familyId: task.familyId,
          taskId: task.id,
          userId: delivery.userId,
          channel: delivery.channel,
          status: 'QUEUED',
          scheduledAt: remindAt,
        },
        update: {},
      });
      const job = await notificationQueue.add('notification-due', delivery.data, {
        jobId: delivery.jobKey,
        delay: Math.max(0, remindAt.getTime() - now.getTime()),
        attempts: 5,
        backoff: { type: 'exponential', delay: 30_000 },
        removeOnComplete: { age: 10 * 24 * 60 * 60, count: 10_000 },
        removeOnFail: { age: 30 * 24 * 60 * 60, count: 10_000 },
      });
      if (job.id) remindersQueued += 1;
    }
  }
  return {
    plansScanned: plans.length,
    tasksGenerated: generated,
    remindersQueued,
    notificationsEnabled: options.notificationsEnabled !== false,
    expiredIdempotencyCleaned: expiredIdempotency.count,
  };
}

export function reminderJobId(taskId: string, scheduledAt: Date) {
  return `reminder-${taskId}-${scheduledAt.getTime()}`;
}
