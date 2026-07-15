import { describe, expect, it } from 'vitest';
import { validateEnvironment } from './environment';

const base = {
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
  REDIS_URL: 'redis://localhost:6379',
};

describe('validateEnvironment', () => {
  it('provides safe local defaults while requiring durable dependencies', () => {
    expect(validateEnvironment(base)).toMatchObject({
      NODE_ENV: 'development',
      PORT: 3000,
      DEV_OTP_CODE: '123456',
      FEATURE_NOTIFICATIONS_ENABLED: true,
      FEATURE_EXPORTS_ENABLED: true,
    });
  });

  it('parses operational feature switches strictly', () => {
    expect(
      validateEnvironment({
        ...base,
        FEATURE_NOTIFICATIONS_ENABLED: 'false',
        FEATURE_EXPORTS_ENABLED: 'false',
      }),
    ).toMatchObject({ FEATURE_NOTIFICATIONS_ENABLED: false, FEATURE_EXPORTS_ENABLED: false });
    expect(() => validateEnvironment({ ...base, FEATURE_NOTIFICATIONS_ENABLED: 'yes' })).toThrow(
      /FEATURE_NOTIFICATIONS_ENABLED/,
    );
  });

  it('treats blank optional provider secrets as unset in development', () => {
    expect(
      validateEnvironment({
        ...base,
        COS_SECRET_ID: '',
        COS_SECRET_KEY: '',
        COS_BUCKET: '',
        COS_REGION: '',
        SMS_APP_ID: '',
        SMS_SIGN_NAME: '',
        SMS_TEMPLATE_ID: '',
        SMS_SECRET_ID: '',
        SMS_SECRET_KEY: '',
      }),
    ).toMatchObject({
      COS_SECRET_ID: undefined,
      COS_SECRET_KEY: undefined,
      COS_BUCKET: undefined,
      COS_REGION: undefined,
      SMS_APP_ID: undefined,
      SMS_SIGN_NAME: undefined,
      SMS_TEMPLATE_ID: undefined,
      SMS_SECRET_ID: undefined,
      SMS_SECRET_KEY: undefined,
    });
  });

  it('accepts managed Redis TLS URLs and rejects unrelated protocols', () => {
    expect(validateEnvironment({ ...base, REDIS_URL: 'rediss://cache.internal/2' }).REDIS_URL).toBe(
      'rediss://cache.internal/2',
    );
    expect(() => validateEnvironment({ ...base, REDIS_URL: 'https://cache.internal' })).toThrow(
      /rediss?/,
    );
  });

  it('rejects production startup with development OTP or missing providers', () => {
    expect(() => validateEnvironment({ ...base, NODE_ENV: 'production' })).toThrow(
      /Invalid environment configuration/,
    );
  });

  it('accepts a fully configured production environment', () => {
    expect(
      validateEnvironment({
        ...base,
        NODE_ENV: 'production',
        DEV_OTP_CODE: '654321',
        JWT_ACCESS_SECRET: 'production-access-secret-at-least-32-characters',
        JWT_REFRESH_SECRET: 'production-refresh-secret-at-least-32-characters',
        PHONE_LOOKUP_SECRET: 'production-phone-lookup-secret-at-least-32-chars',
        PHONE_ENCRYPTION_SECRET: 'production-phone-encryption-secret-at-least-32-chars',
        CHANNEL_ENCRYPTION_SECRET: 'production-channel-encryption-secret-at-least-32-chars',
        COS_SECRET_ID: 'id',
        COS_SECRET_KEY: 'key',
        COS_BUCKET: 'bucket-123',
        COS_REGION: 'ap-shanghai',
        SMS_APP_ID: 'app',
        SMS_SIGN_NAME: 'sign',
        SMS_TEMPLATE_ID: 'template',
        SMS_SECRET_ID: 'sms-secret-id',
        SMS_SECRET_KEY: 'sms-secret-key',
        METRICS_TOKEN: 'production-metrics-token-at-least-32-characters',
      }).NODE_ENV,
    ).toBe('production');
  });
});
