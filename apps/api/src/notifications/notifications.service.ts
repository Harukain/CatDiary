import { HttpStatus, Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NotificationChannelType, NotificationStatus } from '@prisma/client';
import { Queue } from 'bullmq';
import { redisConnectionFromUrl } from '@cat-diary/domain';
import { AppException } from '../common/app.exception';
import { PrismaService } from '../prisma/prisma.service';
import { ChannelSecretService } from './channel-secret.service';

@Injectable()
export class NotificationsService implements OnModuleDestroy {
  private readonly queue: Queue;
  private readonly enabled: boolean;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
    private readonly secrets: ChannelSecretService,
  ) {
    const connection = redisConnectionFromUrl(config.get('REDIS_URL', 'redis://localhost:6379'));
    this.enabled = config.get<boolean>('FEATURE_NOTIFICATIONS_ENABLED', true);
    this.queue = new Queue('cat-diary-notifications', {
      connection,
    });
  }

  async onModuleDestroy() {
    await this.queue.close();
  }

  preference(familyId: string, userId: string) {
    return this.prisma.notificationPreference.upsert({
      where: { familyId_userId: { familyId, userId } },
      create: { familyId, userId },
      update: {},
      select: {
        taskReminderEnabled: true,
        pushEnabled: true,
        overdueEnabled: true,
        updatedAt: true,
      },
    });
  }

  updatePreference(
    familyId: string,
    userId: string,
    input: { taskReminderEnabled?: boolean; pushEnabled?: boolean; overdueEnabled?: boolean },
  ) {
    return this.prisma.notificationPreference.upsert({
      where: { familyId_userId: { familyId, userId } },
      create: { familyId, userId, ...input },
      update: input,
      select: {
        taskReminderEnabled: true,
        pushEnabled: true,
        overdueEnabled: true,
        updatedAt: true,
      },
    });
  }

  async list(
    familyId: string,
    filters: { status?: NotificationStatus; cursor?: string; limit: number },
  ) {
    const rows = await this.prisma.notificationLog.findMany({
      where: { familyId, ...(filters.status ? { status: filters.status } : {}) },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: filters.limit + 1,
      ...(filters.cursor ? { cursor: { id: filters.cursor }, skip: 1 } : {}),
      include: { task: { select: { id: true, title: true, scheduledAt: true } } },
    });
    const hasMore = rows.length > filters.limit;
    const items = hasMore ? rows.slice(0, filters.limit) : rows;
    return { items, page: { hasMore, nextCursor: hasMore ? (items.at(-1)?.id ?? null) : null } };
  }

  async retry(familyId: string, id: string) {
    this.requireEnabled();
    const log = await this.prisma.notificationLog.findFirst({
      where: { id, familyId },
      include: { task: { select: { id: true, familyId: true, title: true, scheduledAt: true } } },
    });
    if (!log)
      throw new AppException('NOTIFICATION_LOG_NOT_FOUND', '通知日志不存在', HttpStatus.NOT_FOUND);
    if (log.status !== NotificationStatus.FAILED)
      throw new AppException(
        'NOTIFICATION_NOT_RETRYABLE',
        '只有失败通知可以重试',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    const job = await this.queue.getJob(log.jobKey);
    if (!log.task)
      throw new AppException(
        'NOTIFICATION_TASK_EXPIRED',
        '原任务已不存在，无法重新发送',
        HttpStatus.GONE,
      );
    const data: Record<string, unknown> = {
      ...log.task,
      channel: log.channel,
    };
    if (log.channel === NotificationChannelType.EXPO_PUSH) {
      if (!log.userId)
        throw new AppException(
          'NOTIFICATION_RECIPIENT_MISSING',
          '通知接收人已不存在',
          HttpStatus.GONE,
        );
      const activeMember = await this.prisma.membership.count({
        where: { familyId, userId: log.userId, status: 'ACTIVE' },
      });
      if (!activeMember)
        throw new AppException(
          'NOTIFICATION_RECIPIENT_LEFT_FAMILY',
          '原接收人已不在当前家庭，不能重新发送',
          HttpStatus.GONE,
        );
      const token = await this.prisma.devicePushToken.findFirst({
        where: {
          userId: log.userId,
          active: true,
          provider: 'EXPO',
          deviceSession: { revokedAt: null, expiresAt: { gt: new Date() } },
        },
        orderBy: { lastSeenAt: 'desc' },
        select: { id: true, token: true },
      });
      if (!token)
        throw new AppException(
          'ACTIVE_PUSH_TOKEN_MISSING',
          '接收设备尚未重新注册推送，请先在 App 中开启通知',
          HttpStatus.UNPROCESSABLE_ENTITY,
        );
      data.pushToken = token.token;
      data.pushTokenId = token.id;
    } else if (log.channel === NotificationChannelType.FEISHU) {
      const channel = await this.prisma.notificationChannel.findUnique({
        where: { familyId_type: { familyId, type: NotificationChannelType.FEISHU } },
        select: { id: true, enabled: true },
      });
      if (!channel?.enabled)
        throw new AppException(
          'FEISHU_CHANNEL_DISABLED',
          '飞书通知尚未配置或已停用',
          HttpStatus.UNPROCESSABLE_ENTITY,
        );
      data.channelId = channel.id;
    }
    const receiptJob = await this.queue.getJob(`${log.jobKey}-receipt`);
    const queued = await this.markNotificationQueued(log.id);
    try {
      if (receiptJob) await receiptJob.remove();
      if (job) await job.remove();
      await this.queue.add('notification-due', data, {
        jobId: log.jobKey,
        attempts: 5,
        backoff: { type: 'exponential', delay: 30_000 },
        removeOnComplete: { age: 10 * 24 * 60 * 60, count: 10_000 },
        removeOnFail: { age: 30 * 24 * 60 * 60, count: 10_000 },
      });
      return queued;
    } catch (error) {
      await this.markNotificationRetryFailed(log.id);
      throw error;
    }
  }

  private markNotificationQueued(id: string) {
    return this.prisma.notificationLog.update({
      where: { id },
      data: {
        status: NotificationStatus.QUEUED,
        providerMessageId: null,
        sentAt: null,
        receiptCheckedAt: null,
        errorCode: null,
        errorMessageSafe: null,
      },
    });
  }

  private markNotificationRetryFailed(id: string) {
    return this.prisma.notificationLog.update({
      where: { id },
      data: {
        status: NotificationStatus.FAILED,
        errorCode: 'NOTIFICATION_RETRY_ENQUEUE_FAILED',
        errorMessageSafe: '通知重试入队失败，请稍后再试',
      },
    });
  }

  channels(familyId: string) {
    return this.prisma.notificationChannel.findMany({
      where: { familyId },
      select: {
        id: true,
        type: true,
        enabled: true,
        maskedHint: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async configureFeishu(familyId: string, actorUserId: string, webhookUrl: string) {
    const parsed = new URL(webhookUrl);
    const allowedHost =
      parsed.hostname === 'open.feishu.cn' || parsed.hostname === 'open.larksuite.com';
    if (
      parsed.protocol !== 'https:' ||
      !allowedHost ||
      !parsed.pathname.includes('/open-apis/bot/')
    ) {
      throw new AppException(
        'INVALID_FEISHU_WEBHOOK',
        '飞书 Webhook 地址格式不正确',
        HttpStatus.BAD_REQUEST,
      );
    }
    const maskedHint = `…${parsed.pathname.slice(-6)}`;
    const channel = await this.prisma.notificationChannel.upsert({
      where: { familyId_type: { familyId, type: NotificationChannelType.FEISHU } },
      create: {
        familyId,
        type: NotificationChannelType.FEISHU,
        encryptedSecret: this.secrets.encrypt(webhookUrl),
        maskedHint,
        enabled: true,
        updatedById: actorUserId,
      },
      update: {
        encryptedSecret: this.secrets.encrypt(webhookUrl),
        maskedHint,
        enabled: true,
        updatedById: actorUserId,
      },
      select: { id: true, type: true, enabled: true, maskedHint: true, updatedAt: true },
    });
    await this.prisma.auditLog.create({
      data: {
        familyId,
        actorUserId,
        action: 'notification.feishu.configure',
        resourceType: 'notification_channel',
        resourceId: channel.id,
        afterSafe: { configured: true, maskedHint },
      },
    });
    return channel;
  }

  async testFeishu(familyId: string) {
    this.requireEnabled();
    const channel = await this.prisma.notificationChannel.findUnique({
      where: { familyId_type: { familyId, type: NotificationChannelType.FEISHU } },
    });
    if (!channel?.enabled || !channel.encryptedSecret)
      throw new AppException(
        'CHANNEL_NOT_CONFIGURED',
        '尚未配置飞书通知',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    try {
      const response = await fetch(this.secrets.decrypt(channel.encryptedSecret), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          msg_type: 'text',
          content: { text: '猫伴日记测试通知：飞书通道配置成功。' },
        }),
        signal: AbortSignal.timeout(8_000),
      });
      const payload = (await response.json()) as {
        code?: number;
        StatusCode?: number;
        msg?: string;
      };
      if (!response.ok || (payload.code ?? payload.StatusCode ?? 0) !== 0)
        throw new Error(payload.msg ?? 'provider rejected');
      return { success: true };
    } catch {
      throw new AppException(
        'CHANNEL_TEST_FAILED',
        '飞书测试发送失败，请检查 Webhook',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  async removeFeishu(familyId: string, actorUserId: string) {
    const channel = await this.prisma.notificationChannel.findUnique({
      where: { familyId_type: { familyId, type: NotificationChannelType.FEISHU } },
    });
    if (!channel) return;
    await this.prisma.$transaction([
      this.prisma.notificationChannel.delete({ where: { id: channel.id } }),
      this.prisma.auditLog.create({
        data: {
          familyId,
          actorUserId,
          action: 'notification.feishu.delete',
          resourceType: 'notification_channel',
          resourceId: channel.id,
          beforeSafe: { configured: true, maskedHint: channel.maskedHint },
        },
      }),
    ]);
  }

  private requireEnabled() {
    if (!this.enabled) {
      throw new AppException(
        'NOTIFICATIONS_TEMPORARILY_DISABLED',
        '提醒通知正在维护，请稍后再试',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }
}
