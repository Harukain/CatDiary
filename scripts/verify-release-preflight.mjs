import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

const root = resolve(import.meta.dirname, '..');
const preflight = resolve(import.meta.dirname, 'release-preflight.mjs');
const tmp = mkdtempSync(join(tmpdir(), 'catdiary-release-preflight-'));

try {
  const validPreview = writeEnv('valid-preview.env', sampleEnv('preview'));
  const validProduction = writeEnv('valid-production.env', sampleEnv('production'));
  const fixedOtp = writeEnv('fixed-otp.env', { ...sampleEnv('preview'), DEV_OTP_CODE: '123456' });
  const localApi = writeEnv('local-api.env', {
    ...sampleEnv('preview'),
    EXPO_PUBLIC_API_URL: 'http://localhost:3000/api/v1',
    PUBLIC_API_URL: 'http://localhost:3000/api/v1',
  });
  const sharedSmsCos = writeEnv('shared-sms-cos.env', {
    ...sampleEnv('preview'),
    SMS_SECRET_ID: sampleEnv('preview').COS_SECRET_ID,
    SMS_SECRET_KEY: sampleEnv('preview').COS_SECRET_KEY,
  });
  const publicApiBind = writeEnv('public-api-bind.env', {
    ...sampleEnv('preview'),
    API_BIND_ADDRESS: '0.0.0.0',
  });
  const invalidApiPort = writeEnv('invalid-api-port.env', {
    ...sampleEnv('preview'),
    API_PORT: 'not-a-port',
  });

  const checks = {
    validPreviewPasses: runPreflight('preview', validPreview).status === 0,
    validProductionPasses: runPreflight('production', validProduction).status === 0,
    rejectsFixedDevelopmentOtp: rejectsWith('preview', fixedOtp, {}, 'DEV_OTP_CODE'),
    rejectsLocalApi: rejectsWith('preview', localApi, {}, 'EXPO_PUBLIC_API_URL'),
    rejectsSharedSmsCosSecret: rejectsWith('preview', sharedSmsCos, {}, 'SMS_SECRET_SEPARATION'),
    rejectsPublicApiBind: rejectsWith('preview', publicApiBind, {}, 'API_BIND_ADDRESS'),
    rejectsPublicApiBindEnvOverride: rejectsWith(
      'preview',
      validPreview,
      { API_BIND_ADDRESS: '0.0.0.0' },
      'API_BIND_ADDRESS',
    ),
    rejectsInvalidApiPort: rejectsWith('preview', invalidApiPort, {}, 'API_PORT'),
    rejectsLatestImage: rejectsWith(
      'preview',
      validPreview,
      { API_IMAGE: 'ccr.ccs.tencentyun.com/harukains/cat-diary-api:latest' },
      'API_IMAGE',
    ),
  };

  if (!Object.values(checks).every(Boolean)) {
    console.error(`RELEASE_PREFLIGHT_SELF_CHECK_INVALID ${JSON.stringify(checks)}`);
    process.exit(1);
  }

  console.log(`RELEASE_PREFLIGHT_SELF_CHECK_OK ${JSON.stringify(checks)}`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

function writeEnv(filename, env) {
  const path = join(tmp, filename);
  const body = Object.entries(env)
    .map(([key, value]) => `${key}=${quote(String(value))}`)
    .join('\n');
  writeFileSync(path, `${body}\n`);
  return path;
}

function quote(value) {
  if (/^[A-Za-z0-9_./:@,+-]+$/.test(value)) return value;
  return JSON.stringify(value);
}

function runPreflight(target, envFile, overrides = {}) {
  return spawnSync(
    process.execPath,
    [
      preflight,
      '--target',
      target,
      '--env-file',
      envFile,
      '--api-image',
      overrides.API_IMAGE ?? image('api'),
      '--worker-image',
      overrides.WORKER_IMAGE ?? image('worker'),
      '--skip-git-clean',
      '--json',
    ],
    { cwd: root, encoding: 'utf8', env: { ...process.env, ...overrides } },
  );
}

function rejectsWith(target, envFile, overrides, expectedCheckName) {
  const result = runPreflight(target, envFile, overrides);
  if (result.status === 0) return false;
  const parsed = parseJson(result.stdout);
  return parsed?.checks?.some((check) => check.name === expectedCheckName && check.ok === false);
}

function parseJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function sampleEnv(target) {
  return {
    NODE_ENV: 'production',
    APP_ENV: target,
    PORT: '3000',
    DATABASE_URL:
      'postgresql://catdiary:prodpass@postgres.catdiary.harukains.internal:5432/catdiary?schema=public',
    REDIS_URL: 'rediss://redis.catdiary.harukains.internal:6380/0',
    JWT_ACCESS_SECRET: 'release-jwt-access-material-32-characters',
    JWT_REFRESH_SECRET: 'release-jwt-refresh-material-32-characters',
    PHONE_LOOKUP_SECRET: 'release-phone-lookup-material-32-characters',
    PHONE_ENCRYPTION_SECRET: 'release-phone-encryption-material-32-chars',
    CHANNEL_ENCRYPTION_SECRET: 'release-channel-encryption-material-32',
    DEV_OTP_CODE: '654321',
    DEFAULT_TIMEZONE: 'Asia/Shanghai',
    CORS_ALLOWED_ORIGINS: 'https://app.catdiary.harukains.com',
    TRUST_PROXY: 'true',
    ENABLE_SWAGGER: 'false',
    FEATURE_NOTIFICATIONS_ENABLED: 'true',
    FEATURE_EXPORTS_ENABLED: 'true',
    METRICS_TOKEN: 'release-metrics-token-material-32-chars',
    WORKER_HOST: '0.0.0.0',
    WORKER_PORT: '3001',
    THROTTLE_DEFAULT_LIMIT: '120',
    THROTTLE_SMS_SEND_LIMIT: '5',
    THROTTLE_SMS_VERIFY_LIMIT: '10',
    EXPO_PUBLIC_API_URL: 'https://api.catdiary.harukains.com/api/v1',
    EAS_PROJECT_ID: '29f29ec5-c4ab-4371-bf41-b5b72077e531',
    EXPO_PUBLIC_PRIVACY_POLICY_URL: 'https://catdiary.harukains.com/privacy',
    EXPO_PUBLIC_TERMS_URL: 'https://catdiary.harukains.com/terms',
    PUBLIC_API_URL: 'https://api.catdiary.harukains.com/api/v1',
    COS_SECRET_ID: 'AKIDreleasecossecretid',
    COS_SECRET_KEY: 'release-cos-secret-key-material',
    COS_BUCKET: `catdiary-${target}-private`,
    COS_REGION: 'ap-shanghai',
    SMS_APP_ID: '1400000000',
    SMS_SIGN_NAME: '猫伴日记',
    SMS_TEMPLATE_ID: '1234567',
    SMS_SECRET_ID: 'AKIDreleasesmssecretid',
    SMS_SECRET_KEY: 'release-sms-secret-key-material',
    SMS_REGION: 'ap-guangzhou',
    SMS_CODE_TTL_SECONDS: '300',
  };
}

function image(name) {
  return `ccr.ccs.tencentyun.com/harukains/cat-diary-${name}:20260717-abcdef`;
}
