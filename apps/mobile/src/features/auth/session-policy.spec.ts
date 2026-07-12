import { describe, expect, it } from 'vitest';
import type { AuthSession } from './auth-api';
import { canRestoreCachedSession, isTerminalSessionError } from './session-policy';

const snapshot: AuthSession = {
  accessToken: 'cached-access',
  refreshToken: 'current-refresh',
  expiresIn: 900,
  user: { id: 'user', displayName: null },
  families: [{ id: 'family', name: '家', timezone: 'Asia/Shanghai', role: 'OWNER' }],
};

describe('session restore policy', () => {
  it.each(['REFRESH_TOKEN_INVALID', 'REFRESH_TOKEN_REUSED', 'REFRESH_TOKEN_MISSING'])(
    'treats %s as terminal',
    (code) => {
      expect(isTerminalSessionError(Object.assign(new Error('expired'), { code }))).toBe(true);
    },
  );

  it('restores the matching encrypted snapshot after a transient failure', () => {
    expect(
      canRestoreCachedSession(new TypeError('Network request failed'), 'current-refresh', snapshot),
    ).toBe(true);
  });

  it('never restores a snapshot from another token generation', () => {
    expect(canRestoreCachedSession(new TypeError('offline'), 'rotated-refresh', snapshot)).toBe(
      false,
    );
  });
});
