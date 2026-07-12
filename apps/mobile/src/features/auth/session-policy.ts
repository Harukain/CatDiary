import type { AuthSession } from './auth-api';

const terminalSessionCodes = new Set([
  'REFRESH_TOKEN_INVALID',
  'REFRESH_TOKEN_REUSED',
  'REFRESH_TOKEN_MISSING',
]);

export function isTerminalSessionError(error: unknown) {
  return error instanceof Error && 'code' in error && terminalSessionCodes.has(String(error.code));
}

export function canRestoreCachedSession(
  error: unknown,
  refreshToken: string,
  snapshot: AuthSession | null,
): snapshot is AuthSession {
  return (
    !isTerminalSessionError(error) && snapshot !== null && snapshot.refreshToken === refreshToken
  );
}
