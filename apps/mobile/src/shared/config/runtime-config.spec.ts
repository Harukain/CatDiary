import { describe, expect, it } from 'vitest';
import { resolveRuntimeConfigValue } from './runtime-config-rules';

describe('resolveRuntimeConfigValue', () => {
  it('uses Expo extra apiUrl and normalizes surrounding whitespace and trailing slashes', () => {
    expect(
      resolveRuntimeConfigValue({
        extra: { apiUrl: ' https://api.catdiary.example.com/api/v1// ' },
        platformOS: 'ios',
      }).apiUrl,
    ).toBe('https://api.catdiary.example.com/api/v1');
  });

  it('falls back to platform-specific local API URLs in development builds', () => {
    expect(resolveRuntimeConfigValue({ extra: {}, platformOS: 'android' }).apiUrl).toBe(
      'http://10.0.2.2:3000/api/v1',
    );
    expect(resolveRuntimeConfigValue({ extra: {}, platformOS: 'ios' }).apiUrl).toBe(
      'http://127.0.0.1:3000/api/v1',
    );
  });

  it('reads typed app environment, EAS project id and public legal links from Expo constants', () => {
    const config = resolveRuntimeConfigValue({
      easProjectId: '11111111-1111-4111-8111-111111111111',
      extra: {
        appEnvironment: 'preview',
        eas: { projectId: '22222222-2222-4222-8222-222222222222' },
        privacyPolicyUrl: ' https://catdiary.example.com/privacy// ',
        termsUrl: ' https://catdiary.example.com/terms// ',
      },
      platformOS: 'ios',
    });

    expect(config).toMatchObject({
      appEnvironment: 'preview',
      easProjectId: '11111111-1111-4111-8111-111111111111',
      privacyPolicyUrl: 'https://catdiary.example.com/privacy',
      termsUrl: 'https://catdiary.example.com/terms',
    });
  });

  it('keeps unsafe or malformed optional public values out of the runtime config', () => {
    expect(
      resolveRuntimeConfigValue({
        extra: {
          appEnvironment: 'staging',
          privacyPolicyUrl: 'http://localhost/privacy',
          termsUrl: 123,
          eas: { projectId: 456 },
        },
        platformOS: 'ios',
      }),
    ).toEqual({ apiUrl: 'http://127.0.0.1:3000/api/v1' });
  });
});
