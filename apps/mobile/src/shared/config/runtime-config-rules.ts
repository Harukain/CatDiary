export type RuntimePlatform = 'android' | 'ios' | 'web' | 'windows' | 'macos';

export interface RuntimeConfig {
  apiUrl: string;
  appEnvironment?: 'development' | 'preview' | 'production';
  easProjectId?: string;
  privacyPolicyUrl?: string;
  termsUrl?: string;
}

export interface RuntimeConfigSource {
  extra?: Record<string, unknown>;
  easProjectId?: string | null;
  platformOS?: RuntimePlatform;
}

export function resolveRuntimeConfigValue(source: RuntimeConfigSource = {}): RuntimeConfig {
  const extra = source.extra ?? {};
  const platformOS = source.platformOS ?? 'ios';
  const appEnvironment = runtimeEnvironment(extra.appEnvironment);
  return {
    apiUrl: runtimeApiUrl(extra.apiUrl, platformOS),
    ...(appEnvironment ? { appEnvironment } : {}),
    ...optionalString('easProjectId', source.easProjectId ?? nestedProjectId(extra.eas)),
    ...optionalHttpsUrl('privacyPolicyUrl', extra.privacyPolicyUrl),
    ...optionalHttpsUrl('termsUrl', extra.termsUrl),
  };
}

function runtimeApiUrl(value: unknown, platformOS: RuntimePlatform) {
  if (typeof value === 'string' && value.trim()) return value.trim().replace(/\/+$/, '');
  const fallbackHost = platformOS === 'android' ? '10.0.2.2' : '127.0.0.1';
  return `http://${fallbackHost}:3000/api/v1`;
}

function runtimeEnvironment(value: unknown): RuntimeConfig['appEnvironment'] {
  if (value === 'development' || value === 'preview' || value === 'production') return value;
  return undefined;
}

function nestedProjectId(value: unknown) {
  if (!value || typeof value !== 'object') return undefined;
  const projectId = (value as Record<string, unknown>).projectId;
  return typeof projectId === 'string' ? projectId : undefined;
}

function optionalString<Key extends keyof RuntimeConfig>(key: Key, value: unknown) {
  return typeof value === 'string' && value.trim() ? { [key]: value.trim() } : {};
}

function optionalHttpsUrl<Key extends keyof RuntimeConfig>(key: Key, value: unknown) {
  if (typeof value !== 'string') return {};
  const normalizedValue = value.trim();
  if (!normalizedValue.startsWith('https://')) return {};
  return { [key]: normalizedValue.replace(/\/+$/, '') };
}
