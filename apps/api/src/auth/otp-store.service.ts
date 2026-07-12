import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

export type OtpVerification = 'OK' | 'EXPIRED' | 'INVALID' | 'LOCKED';

@Injectable()
export class OtpStoreService implements OnModuleDestroy {
  private readonly redis: Redis;

  constructor(config: ConfigService) {
    this.redis = new Redis(config.getOrThrow<string>('REDIS_URL'), {
      lazyConnect: true,
      maxRetriesPerRequest: 2,
      enableReadyCheck: true,
    });
  }

  async onModuleDestroy() {
    this.redis.disconnect(false);
  }

  async reserve(phoneKey: string, cooldownSeconds: number, dailyLimit: number) {
    const cooldownKey = `otp:cooldown:${phoneKey}`;
    const reserved = await this.redis.set(cooldownKey, '1', 'EX', cooldownSeconds, 'NX');
    if (!reserved)
      return { status: 'COOLDOWN' as const, retryAfter: await this.redis.ttl(cooldownKey) };

    const day = new Date().toISOString().slice(0, 10);
    const dailyKey = `otp:daily:${day}:${phoneKey}`;
    const count = await this.redis.incr(dailyKey);
    if (count === 1) await this.redis.expire(dailyKey, 48 * 60 * 60);
    return count > dailyLimit ? { status: 'DAILY_LIMIT' as const } : { status: 'OK' as const };
  }

  async save(phoneKey: string, codeHash: string, ttlSeconds: number) {
    await this.redis.set(`otp:challenge:${phoneKey}`, codeHash, 'EX', ttlSeconds);
  }

  async cancel(phoneKey: string) {
    await this.redis.del(`otp:challenge:${phoneKey}`, `otp:cooldown:${phoneKey}`);
  }

  async verify(
    phoneKey: string,
    codeHash: string,
    ttlSeconds: number,
    maxAttempts: number,
  ): Promise<OtpVerification> {
    const result = await this.redis.eval(
      `
      local expected = redis.call('GET', KEYS[1])
      if not expected then return 'EXPIRED' end
      if expected == ARGV[1] then
        redis.call('DEL', KEYS[1], KEYS[2])
        return 'OK'
      end
      local attempts = redis.call('INCR', KEYS[2])
      redis.call('EXPIRE', KEYS[2], ARGV[2])
      if attempts >= tonumber(ARGV[3]) then
        redis.call('DEL', KEYS[1], KEYS[2])
        return 'LOCKED'
      end
      return 'INVALID'
      `,
      2,
      `otp:challenge:${phoneKey}`,
      `otp:attempts:${phoneKey}`,
      codeHash,
      ttlSeconds,
      maxAttempts,
    );
    return String(result) as OtpVerification;
  }
}
