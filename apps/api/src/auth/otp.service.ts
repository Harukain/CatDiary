import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomInt } from 'node:crypto';
import { AppException } from '../common/app.exception';
import { PhoneSecurityService } from './phone-security.service';
import { SmsProviderService } from './sms-provider.service';
import { OtpStoreService } from './otp-store.service';

interface SendState {
  lastSentAt: number;
  day: string;
  count: number;
}

@Injectable()
export class OtpService {
  private readonly sends = new Map<string, SendState>();

  constructor(
    private readonly config: ConfigService,
    private readonly phoneSecurity: PhoneSecurityService,
    private readonly sms: SmsProviderService,
    private readonly store: OtpStoreService,
  ) {}

  async send(phone: string) {
    const key = this.lookupKey(phone);
    if (this.config.get('NODE_ENV') === 'production') return this.sendProduction(phone, key);
    const now = Date.now();
    const day = new Date(now).toISOString().slice(0, 10);
    const state = this.sends.get(key);
    if (state && now - state.lastSentAt < 60_000) {
      throw new AppException(
        'RATE_LIMITED',
        '请稍后再获取验证码',
        HttpStatus.TOO_MANY_REQUESTS,
        undefined,
        {
          retryAfter: Math.ceil((60_000 - (now - state.lastSentAt)) / 1000),
        },
      );
    }
    const count = state?.day === day ? state.count + 1 : 1;
    if (count > 10)
      throw new AppException(
        'RATE_LIMITED',
        '今日验证码获取次数已达上限',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    this.sends.set(key, { lastSentAt: now, day, count });
    return { cooldownSeconds: 60 };
  }

  async verify(phone: string, code: string) {
    if (this.config.get('NODE_ENV') === 'production') return this.verifyProduction(phone, code);
    if (code !== this.config.get('DEV_OTP_CODE', '123456')) {
      throw new AppException('INVALID_CODE', '验证码不正确', HttpStatus.UNAUTHORIZED, [
        { field: 'code', code: 'INVALID_CODE' },
      ]);
    }
  }

  private lookupKey(phone: string) {
    return this.phoneSecurity.hash(phone);
  }

  private async sendProduction(phone: string, key: string) {
    const cooldownSeconds = 60;
    const reservation = await this.store.reserve(key, cooldownSeconds, 10);
    if (reservation.status === 'COOLDOWN')
      throw new AppException(
        'RATE_LIMITED',
        '请稍后再获取验证码',
        HttpStatus.TOO_MANY_REQUESTS,
        undefined,
        { retryAfter: Math.max(1, reservation.retryAfter) },
      );
    if (reservation.status === 'DAILY_LIMIT')
      throw new AppException(
        'RATE_LIMITED',
        '今日验证码获取次数已达上限',
        HttpStatus.TOO_MANY_REQUESTS,
      );

    const ttlSeconds = this.config.get('SMS_CODE_TTL_SECONDS', 300);
    const code = String(randomInt(100_000, 1_000_000));
    await this.store.save(key, this.codeHash(key, code), ttlSeconds);
    try {
      await this.sms.sendCode(phone, code, Math.ceil(ttlSeconds / 60));
    } catch {
      await this.store.cancel(key);
      throw new AppException(
        'SMS_SEND_FAILED',
        '验证码发送失败，请稍后重试',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    return { cooldownSeconds };
  }

  private async verifyProduction(phone: string, code: string) {
    const key = this.lookupKey(phone);
    const ttlSeconds = this.config.get('SMS_CODE_TTL_SECONDS', 300);
    const result = await this.store.verify(key, this.codeHash(key, code), ttlSeconds, 5);
    if (result === 'OK') return;
    if (result === 'EXPIRED')
      throw new AppException('CODE_EXPIRED', '验证码已过期，请重新获取', HttpStatus.UNAUTHORIZED);
    if (result === 'LOCKED')
      throw new AppException(
        'CODE_ATTEMPTS_EXCEEDED',
        '验证码错误次数过多，请重新获取',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    throw new AppException('INVALID_CODE', '验证码不正确', HttpStatus.UNAUTHORIZED, [
      { field: 'code', code: 'INVALID_CODE' },
    ]);
  }

  private codeHash(phoneKey: string, code: string) {
    return createHmac('sha256', this.config.getOrThrow<string>('PHONE_LOOKUP_SECRET'))
      .update(`${phoneKey}:${code}`)
      .digest('hex');
  }
}
