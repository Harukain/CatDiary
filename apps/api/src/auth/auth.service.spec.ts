import { describe, expect, it, vi } from 'vitest';
import { AuthService } from './auth.service';

function fixture(sessionCount = 1) {
  const tx = {
    deviceSession: { updateMany: vi.fn().mockResolvedValue({ count: sessionCount }) },
    devicePushToken: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
  };
  const prisma = {
    ...tx,
    $transaction: vi.fn((operation: (client: typeof tx) => unknown) => operation(tx)),
  };
  const service = new AuthService(
    prisma as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );
  return { service, prisma, tx };
}

describe('AuthService push token lifecycle', () => {
  it('deactivates the current session push token in the logout transaction', async () => {
    const { service, tx } = fixture();
    await service.logout('user-id', 'session-id');
    expect(tx.devicePushToken.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user-id', deviceSessionId: 'session-id', active: true },
      data: { active: false },
    });
  });

  it('deactivates every user push token on logout-all', async () => {
    const { service, tx } = fixture(3);
    await expect(service.logoutAll('user-id')).resolves.toEqual({ revokedCount: 3 });
    expect(tx.devicePushToken.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user-id', active: true },
      data: { active: false },
    });
  });

  it('deactivates only the explicitly revoked device session token', async () => {
    const { service, tx } = fixture();
    await service.revokeSession('user-id', 'other-session-id', 'current-session-id');
    expect(tx.devicePushToken.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user-id', deviceSessionId: 'other-session-id', active: true },
      data: { active: false },
    });
  });
});
