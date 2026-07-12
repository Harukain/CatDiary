import type { PrismaClient } from '@prisma/client';
import { createDecipheriv, createHash } from 'node:crypto';

export interface NotificationJobData {
  id: string;
  familyId: string;
  title: string;
  scheduledAt: string | Date;
  channel: 'DEVELOPMENT' | 'EXPO_PUSH' | 'FEISHU';
  pushToken?: string;
  pushTokenId?: string;
  channelId?: string;
}

export async function sendNotification(prisma: PrismaClient, data: NotificationJobData) {
  const message = formatTaskMessage(data.title, new Date(data.scheduledAt));
  if (data.channel === 'DEVELOPMENT') {
    console.info(
      JSON.stringify({
        level: 'info',
        service: 'notification-sender',
        event: 'development-notification',
        taskId: data.id,
        familyId: data.familyId,
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
        body: message,
        sound: 'default',
        data: { taskId: data.id, familyId: data.familyId },
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

export function formatTaskMessage(title: string, scheduledAt: Date) {
  const time = scheduledAt.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false });
  return `${title} · ${time}`;
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
