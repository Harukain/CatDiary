import { HttpStatus, Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NotificationChannelType, NotificationStatus, PushProvider } from '@prisma/client';
import { Queue } from 'bullmq';
import { redisConnectionFromUrl } from '@cat-diary/domain';
import { AppException } from '../common/app.exception';
import { PrismaService } from '../prisma/prisma.service';
import { ChannelSecretService } from './channel-secret.service';

const FEISHU_TEST_RATE_LIMIT = 5;
const FEISHU_TEST_WINDOW_MS = 60 * 60 * 1000;
const FEISHU_TEST_RATE_LIMIT_COMMAND = 'catDiaryFeishuTestRateLimit';
const FEISHU_TEST_RATE_LIMIT_SCRIPT = `
local current = redis.call('INCR', KEYS[1])
if current == 1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
end
local ttl = redis.call('PTTL', KEYS[1])
return { current, ttl }
`;

@Injectable()
export class NotificationsService implements OnModuleDestroy {
  private readonly queue: Queue;
  private readonly enabled: boolean;
  private rateLimitCommandDefined = false;

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

  async testCurrentDevicePush(familyId: string, userId: string, sessionId: string) {
    this.requireEnabled();
    const preference = await this.prisma.notificationPreference.findUnique({
      where: { familyId_userId: { familyId, userId } },
      select: { pushEnabled: true },
    });
    if (preference?.pushEnabled === false)
      throw new AppException(
        'PUSH_PREFERENCE_DISABLED',
        '请先开启手机推送，再发送测试通知',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    const token = await this.prisma.devicePushToken.findFirst({
      where: {
        userId,
        deviceSessionId: sessionId,
        active: true,
        provider: PushProvider.EXPO,
        deviceSession: { revokedAt: null, expiresAt: { gt: new Date() } },
      },
      orderBy: { lastSeenAt: 'desc' },
      select: { id: true, token: true },
    });
    if (!token)
      throw new AppException(
        'CURRENT_DEVICE_PUSH_TOKEN_MISSING',
        '当前设备尚未登记推送，请先登记当前设备',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    try {
      const providerMessageId = await this.sendExpoPushTest(token.token, familyId);
      return { success: true, providerMessageId, sentAt: new Date().toISOString() };
    } catch (error) {
      if (error instanceof ExpoPushTestError && error.providerCode === 'DeviceNotRegistered') {
        await this.prisma.devicePushToken.update({
          where: { id: token.id },
          data: { active: false },
        });
        throw new AppException(
          'PUSH_TOKEN_NOT_DELIVERABLE',
          '当前设备推送 Token 已失效，请重新登记当前设备',
          HttpStatus.UNPROCESSABLE_ENTITY,
        );
      }
      throw new AppException(
        'PUSH_TEST_FAILED',
        safePushTestFailureMessage(error),
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
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
    const queueJobId = notificationQueueJobId(log.jobKey);
    const job = await this.queue.getJob(queueJobId);
    if (!log.task)
      throw new AppException(
        'NOTIFICATION_TASK_EXPIRED',
        '原任务已不存在，无法重新发送',
        HttpStatus.GONE,
      );
    const data: Record<string, unknown> = {
      ...log.task,
      channel: log.channel,
      stage: notificationStageFromJobKey(log.jobKey),
      jobKey: log.jobKey,
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
    const receiptJob = await this.queue.getJob(notificationQueueJobId(`${log.jobKey}:receipt`));
    const queued = await this.markNotificationQueued(log.id);
    try {
      if (receiptJob) await receiptJob.remove();
      if (job) await job.remove();
      await this.queue.add('notification-due', data, {
        jobId: queueJobId,
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
    await this.reserveFeishuTestAttempt(familyId);
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

  private async reserveFeishuTestAttempt(familyId: string) {
    const client = await this.queue.client;
    if (!this.rateLimitCommandDefined) {
      client.defineCommand(FEISHU_TEST_RATE_LIMIT_COMMAND, {
        numberOfKeys: 1,
        lua: FEISHU_TEST_RATE_LIMIT_SCRIPT,
      });
      this.rateLimitCommandDefined = true;
    }
    const result = (await client.runCommand(FEISHU_TEST_RATE_LIMIT_COMMAND, [
      `catdiary:feishu-test:${familyId}`,
      FEISHU_TEST_WINDOW_MS,
    ])) as [number | string, number | string];
    const count = Number(result[0]);
    const ttlMs = Math.max(0, Number(result[1]));
    if (count <= FEISHU_TEST_RATE_LIMIT) return;
    throw new AppException(
      'FEISHU_TEST_RATE_LIMITED',
      '飞书测试发送过于频繁，请稍后再试',
      HttpStatus.TOO_MANY_REQUESTS,
      undefined,
      {
        limit: FEISHU_TEST_RATE_LIMIT,
        windowSeconds: FEISHU_TEST_WINDOW_MS / 1000,
        retryAfterSeconds: Math.ceil(ttlMs / 1000),
      },
    );
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

  private async sendExpoPushTest(token: string, familyId: string) {
    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        to: token,
        title: '猫伴日记测试通知',
        body: '如果你看到这条消息，当前设备已可以接收系统推送。',
        sound: 'default',
        data: { familyId, category: 'PUSH_TEST' },
      }),
      signal: AbortSignal.timeout(10_000),
    });
    const payload = (await response.json()) as {
      data?: { status?: string; id?: string; message?: string; details?: { error?: string } };
    };
    if (!response.ok || payload.data?.status === 'error') {
      const providerCode = payload.data?.details?.error ?? payload.data?.message ?? response.status;
      throw new ExpoPushTestError(String(providerCode));
    }
    return payload.data?.id ?? null;
  }
}

class ExpoPushTestError extends Error {
  constructor(public readonly providerCode: string) {
    super(providerCode);
  }
}

function safePushTestFailureMessage(error: unknown) {
  if (error instanceof ExpoPushTestError) {
    if (error.providerCode === 'MessageTooBig') return '测试推送内容过大，请联系开发者处理';
    if (error.providerCode === 'InvalidCredentials') return '推送凭据无效，请检查 EAS/APNs 配置';
  }
  return '测试推送发送失败，请稍后重试';
}

function notificationStageFromJobKey(jobKey: string) {
  const stage = jobKey.split(':').at(-1);
  if (stage === 'due' || stage === 'overdue-1' || stage === 'overdue-2' || stage === 'overdue-3') {
    return stage;
  }
  return 'due';
}

function notificationQueueJobId(jobKey: string) {
  return jobKey.replaceAll(':', '__');
}
