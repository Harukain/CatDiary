import { describe, expect, it } from 'vitest';
import { validateWorkerEnvironment } from './environment.js';

const base = {
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/catdiary',
  REDIS_URL: 'redis://localhost:6379',
};

describe('validateWorkerEnvironment', () => {
  it('accepts local dependencies with safe development defaults', () => {
    expect(validateWorkerEnvironment(base)).toMatchObject({
      NODE_ENV: 'development',
      FEATURE_NOTIFICATIONS_ENABLED: true,
      FEATURE_EXPORTS_ENABLED: true,
    });
  });

  it('parses disabled workers without accepting ambiguous values', () => {
    expect(
      validateWorkerEnvironment({
        ...base,
        FEATURE_NOTIFICATIONS_ENABLED: 'false',
        FEATURE_EXPORTS_ENABLED: 'false',
      }),
    ).toMatchObject({ FEATURE_NOTIFICATIONS_ENABLED: false, FEATURE_EXPORTS_ENABLED: false });
    expect(() => validateWorkerEnvironment({ ...base, FEATURE_EXPORTS_ENABLED: '0' })).toThrow(
      /FEATURE_EXPORTS_ENABLED/,
    );
  });

  it('treats blank optional object storage secrets as unset in development', () => {
    expect(
      validateWorkerEnvironment({
        ...base,
        EXPORT_LOCAL_DIR: '',
        UPLOAD_LOCAL_DIR: '   ',
        COS_SECRET_ID: '',
        COS_SECRET_KEY: '',
        COS_BUCKET: '',
        COS_REGION: '',
      }),
    ).toMatchObject({
      EXPORT_LOCAL_DIR: undefined,
      UPLOAD_LOCAL_DIR: undefined,
      COS_SECRET_ID: undefined,
      COS_SECRET_KEY: undefined,
      COS_BUCKET: undefined,
      COS_REGION: undefined,
    });
  });

  it('accepts rediss and rejects non-Redis dependency URLs', () => {
    expect(
      validateWorkerEnvironment({ ...base, REDIS_URL: 'rediss://cache.internal/5' }).REDIS_URL,
    ).toBe('rediss://cache.internal/5');
    expect(() =>
      validateWorkerEnvironment({ ...base, REDIS_URL: 'https://cache.internal' }),
    ).toThrow(/rediss?/);
  });

  it('rejects production without private object storage', () => {
    expect(() => validateWorkerEnvironment({ ...base, NODE_ENV: 'production' })).toThrow(
      /COS_SECRET_ID/,
    );
  });

  it('accepts a complete production worker environment', () => {
    expect(
      validateWorkerEnvironment({
        ...base,
        NODE_ENV: 'production',
        CHANNEL_ENCRYPTION_SECRET: 'production-channel-secret-at-least-32-characters',
        METRICS_TOKEN: 'production-metrics-token-at-least-32-characters',
        COS_SECRET_ID: 'id',
        COS_SECRET_KEY: 'key',
        COS_BUCKET: 'bucket',
        COS_REGION: 'ap-shanghai',
      }).NODE_ENV,
    ).toBe('production');
  });
});
