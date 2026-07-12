import type { PrismaClient } from '@prisma/client';

export interface ExpoReceiptJobData {
  notificationLogId: string;
  receiptId: string;
  pushTokenId?: string;
}

type Receipt = {
  status?: 'ok' | 'error';
  message?: string;
  details?: { error?: string };
};

type ReceiptPrisma = Pick<PrismaClient, 'notificationLog' | 'devicePushToken'>;

export async function processExpoReceipt(
  prisma: ReceiptPrisma,
  data: ExpoReceiptJobData,
  fetcher: typeof fetch = fetch,
) {
  const response = await fetcher('https://exp.host/--/api/v2/push/getReceipts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ ids: [data.receiptId] }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`EXPO_RECEIPT_HTTP_${response.status}`);
  const payload = (await response.json()) as { data?: Record<string, Receipt> };
  const receipt = payload.data?.[data.receiptId];
  if (!receipt) throw new Error('EXPO_RECEIPT_PENDING');

  const checkedAt = new Date();
  if (receipt.status === 'ok') {
    await prisma.notificationLog.update({
      where: { id: data.notificationLogId },
      data: {
        status: 'DELIVERED',
        receiptCheckedAt: checkedAt,
        errorCode: null,
        errorMessageSafe: null,
      },
    });
    return { status: 'DELIVERED' as const };
  }

  const providerError = receipt.details?.error ?? 'UNKNOWN';
  await prisma.notificationLog.update({
    where: { id: data.notificationLogId },
    data: {
      status: 'FAILED',
      receiptCheckedAt: checkedAt,
      errorCode: `EXPO_${providerError.toUpperCase()}`,
      errorMessageSafe: (receipt.message ?? 'Expo push receipt rejected').slice(0, 300),
    },
  });
  if (providerError === 'DeviceNotRegistered' && data.pushTokenId) {
    await prisma.devicePushToken.updateMany({
      where: { id: data.pushTokenId },
      data: { active: false },
    });
  }
  return { status: 'FAILED' as const, providerError };
}
