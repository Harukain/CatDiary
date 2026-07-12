import { ConfigService } from '@nestjs/config';
import { describe, expect, it } from 'vitest';
import { AppException } from '../common/app.exception';
import { OtpService } from './otp.service';
import { PhoneSecurityService } from './phone-security.service';
import type { SmsProviderService } from './sms-provider.service';
import type { OtpStoreService, OtpVerification } from './otp-store.service';

function createService(environment = 'development') {
  const config = new ConfigService({
    NODE_ENV: environment,
    DEV_OTP_CODE: '123456',
    PHONE_LOOKUP_SECRET: 'test-phone-secret',
    SMS_CODE_TTL_SECONDS: 300,
  });
  let savedHash: string | null = null;
  let sentCode: string | null = null;
  const sms = {
    sendCode: async (_phone: string, code: string) => {
      sentCode = code;
      return { providerMessageId: 'test-message' };
    },
  } as unknown as SmsProviderService;
  const store = {
    reserve: async () => ({ status: 'OK' as const }),
    save: async (_key: string, hash: string) => {
      savedHash = hash;
    },
    cancel: async () => {
      savedHash = null;
    },
    verify: async (_key: string, hash: string): Promise<OtpVerification> => {
      if (!savedHash) return 'EXPIRED';
      if (hash !== savedHash) return 'INVALID';
      savedHash = null;
      return 'OK';
    },
  } as unknown as OtpStoreService;
  return {
    service: new OtpService(config, new PhoneSecurityService(config), sms, store),
    sentCode: () => sentCode,
  };
}

describe('OtpService', () => {
  it('accepts only the fixed development code', async () => {
    const { service } = createService();
    await expect(service.verify('13800138000', '123456')).resolves.toBeUndefined();
    await expect(service.verify('13800138000', '000000')).rejects.toBeInstanceOf(AppException);
  });

  it('uses a random, one-time code in production', async () => {
    const { service, sentCode } = createService('production');
    await expect(service.send('13800138000')).resolves.toEqual({ cooldownSeconds: 60 });
    expect(sentCode()).toMatch(/^\d{6}$/);
    await expect(service.verify('13800138000', sentCode()!)).resolves.toBeUndefined();
    await expect(service.verify('13800138000', sentCode()!)).rejects.toThrow(/过期/);
  });

  it('limits repeated sends without storing the raw phone number', async () => {
    const { service } = createService();
    await expect(service.send('13800138000')).resolves.toEqual({ cooldownSeconds: 60 });
    await expect(service.send('13800138000')).rejects.toThrow(/稍后再获取/);
    expect(JSON.stringify(service)).not.toContain('13800138000');
  });
});
