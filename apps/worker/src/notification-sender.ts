import type { PrismaClient } from '@prisma/client';
import { createDecipheriv, createHash } from 'node:crypto';

export interface NotificationJobData {
  id: string;
  familyId: string;
  title: string;
  scheduledAt: string | Date;
  channel: 'DEVELOPMENT' | 'EXPO_PUSH' | 'FEISHU';
  stage?: ReminderStage;
  jobKey?: string;
  pushToken?: string;
  pushTokenId?: string;
  channelId?: string;
}

export type ReminderStage = 'due' | 'overdue-1' | 'overdue-2' | 'overdue-3';

export async function sendNotification(prisma: PrismaClient, data: NotificationJobData) {
  const stage = data.stage ?? 'due';
  const message = formatTaskMessage(data.title, new Date(data.scheduledAt), stage);
  if (data.channel === 'DEVELOPMENT') {
    console.info(
      JSON.stringify({
        level: 'info',
        service: 'notification-sender',
        event: 'development-notification',
        taskId: data.id,
        familyId: data.familyId,
        stage,
      }),
    );
    return { channel: data.channel, providerMessageId: null };
  }
  if (data.channel === 'EXPO_PUSH') {
    if (!data.pushToken) throw new Error('PUSH_TOKEN_MISSING');
    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        to: data.pushToken,
        title: '猫伴日记提醒',
        body: formatPushLockScreenBody(stage),
        sound: 'default',
        data: { taskId: data.id, familyId: data.familyId, category: 'TASK_REMINDER', stage },
      }),
      signal: AbortSignal.timeout(10_000),
    });
    const payload = (await response.json()) as {
      data?: { status?: string; id?: string; message?: string };
    };
    if (!response.ok || payload.data?.status === 'error')
      throw new Error(`EXPO_PUSH_REJECTED:${payload.data?.message ?? response.status}`);
    return { channel: data.channel, providerMessageId: payload.data?.id ?? null };
  }
  if (!data.channelId) throw new Error('FEISHU_CHANNEL_MISSING');
  const channel = await prisma.notificationChannel.findUnique({ where: { id: data.channelId } });
  if (!channel?.enabled || !channel.encryptedSecret) throw new Error('FEISHU_CHANNEL_DISABLED');
  const webhookUrl = decryptSecret(
    channel.encryptedSecret,
    process.env.CHANNEL_ENCRYPTION_SECRET ?? 'cat-diary-dev-channel-encryption-secret',
  );
  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ msg_type: 'text', content: { text: `猫伴日记提醒\n${message}` } }),
    signal: AbortSignal.timeout(10_000),
  });
  const payload = (await response.json()) as { code?: number; StatusCode?: number; msg?: string };
  if (!response.ok || (payload.code ?? payload.StatusCode ?? 0) !== 0)
    throw new Error(`FEISHU_REJECTED:${payload.msg ?? response.status}`);
  return { channel: data.channel, providerMessageId: null };
}

export function formatTaskMessage(title: string, scheduledAt: Date, stage: ReminderStage = 'due') {
  const time = scheduledAt.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false });
  if (stage === 'due') return `有一项照顾任务到时间了：${title} · ${time}`;
  return `有一项照顾任务已逾期：${title} · 原计划 ${time}`;
}

export function formatPushLockScreenBody(stage: ReminderStage = 'due') {
  if (stage === 'due') return '有一项猫咪照顾任务到时间了，打开猫伴日记查看详情。';
  return '有一项猫咪照顾任务已逾期，打开猫伴日记查看详情。';
}

function decryptSecret(value: string, secret: string) {
  const [ivValue, tagValue, encryptedValue] = value.split('.');
  if (!ivValue || !tagValue || !encryptedValue) throw new Error('INVALID_CHANNEL_SECRET');
  const key = createHash('sha256').update(secret).digest();
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivValue, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagValue, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedValue, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}
