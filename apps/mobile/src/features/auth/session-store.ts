import * as SecureStore from 'expo-secure-store';
import type { AuthSession } from './auth-api';

const REFRESH_TOKEN_KEY = 'cat-diary.refresh-token';
const SESSION_SNAPSHOT_KEY = 'cat-diary.session-snapshot';
const DEVICE_ID_KEY = 'cat-diary.device-id';

function createDeviceId() {
  return `mobile-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

export async function getOrCreateDeviceId() {
  const stored = await SecureStore.getItemAsync(DEVICE_ID_KEY);
  if (stored) return stored;
  const deviceId = createDeviceId();
  await SecureStore.setItemAsync(DEVICE_ID_KEY, deviceId);
  return deviceId;
}

export function saveRefreshToken(refreshToken: string) {
  return SecureStore.setItemAsync(REFRESH_TOKEN_KEY, refreshToken, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}

export function getRefreshToken() {
  return SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
}

export function clearRefreshToken() {
  return SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
}

export async function saveAuthSession(session: AuthSession) {
  const options = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };
  await Promise.all([
    SecureStore.setItemAsync(REFRESH_TOKEN_KEY, session.refreshToken, options),
    SecureStore.setItemAsync(SESSION_SNAPSHOT_KEY, JSON.stringify(session), options),
  ]);
}

export async function getSessionSnapshot() {
  const value = await SecureStore.getItemAsync(SESSION_SNAPSHOT_KEY);
  if (!value) return null;
  try {
    const session = JSON.parse(value) as Partial<AuthSession>;
    if (
      typeof session.accessToken !== 'string' ||
      typeof session.refreshToken !== 'string' ||
      !session.user ||
      !Array.isArray(session.families)
    )
      return null;
    return session as AuthSession;
  } catch {
    return null;
  }
}

export function clearAuthSession() {
  return Promise.all([
    SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY),
    SecureStore.deleteItemAsync(SESSION_SNAPSHOT_KEY),
  ]).then(() => undefined);
}
