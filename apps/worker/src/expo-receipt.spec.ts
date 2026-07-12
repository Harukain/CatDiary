import { describe, expect, it, vi } from 'vitest';
import { processExpoReceipt } from './expo-receipt';

function mockPrisma() {
  return {
    notificationLog: { update: vi.fn() },
    devicePushToken: { updateMany: vi.fn() },
  };
}

function response(body: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => body } as Response;
}

describe('processExpoReceipt', () => {
  it('marks an accepted receipt delivered', async () => {
    const prisma = mockPrisma();
    const fetcher = vi.fn().mockResolvedValue(response({ data: { receipt: { status: 'ok' } } }));
    const result = await processExpoReceipt(
      prisma as never,
      { notificationLogId: 'log', receiptId: 'receipt', pushTokenId: 'token' },
      fetcher,
    );
    expect(result.status).toBe('DELIVERED');
    expect(prisma.notificationLog.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'DELIVERED' }) }),
    );
  });

  it('deactivates a token rejected as DeviceNotRegistered', async () => {
    const prisma = mockPrisma();
    const fetcher = vi.fn().mockResolvedValue(
      response({
        data: {
          receipt: {
            status: 'error',
            message: 'Device is not registered',
            details: { error: 'DeviceNotRegistered' },
          },
        },
      }),
    );
    const result = await processExpoReceipt(
      prisma as never,
      { notificationLogId: 'log', receiptId: 'receipt', pushTokenId: 'token' },
      fetcher,
    );
    expect(result.status).toBe('FAILED');
    expect(prisma.devicePushToken.updateMany).toHaveBeenCalledWith({
      where: { id: 'token' },
      data: { active: false },
    });
  });

  it('retries while Expo has no receipt yet', async () => {
    const prisma = mockPrisma();
    const fetcher = vi.fn().mockResolvedValue(response({ data: {} }));
    await expect(
      processExpoReceipt(
        prisma as never,
        { notificationLogId: 'log', receiptId: 'receipt' },
        fetcher,
      ),
    ).rejects.toThrow('EXPO_RECEIPT_PENDING');
    expect(prisma.notificationLog.update).not.toHaveBeenCalled();
  });
});
