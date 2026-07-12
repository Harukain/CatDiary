import { OtpStoreService } from '../apps/api/dist/auth/otp-store.service.js';

const redisUrl = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379';
const store = new OtpStoreService({ getOrThrow: () => redisUrl });
const key = `integration-${crypto.randomUUID()}`;

try {
  const first = await store.reserve(key, 60, 10);
  const cooldown = await store.reserve(key, 60, 10);
  await store.save(key, 'expected-hash', 300);
  const invalidResults = [];
  for (let attempt = 0; attempt < 4; attempt += 1)
    invalidResults.push(await store.verify(key, 'wrong-hash', 300, 5));
  const locked = await store.verify(key, 'wrong-hash', 300, 5);
  const expiredAfterLock = await store.verify(key, 'expected-hash', 300, 5);

  await store.save(key, 'fresh-hash', 300);
  const accepted = await store.verify(key, 'fresh-hash', 300, 5);
  const oneTime = await store.verify(key, 'fresh-hash', 300, 5);

  const checks = {
    firstReserved: first.status === 'OK',
    cooldownEnforced: cooldown.status === 'COOLDOWN',
    invalidAttemptsTracked: invalidResults.every((result) => result === 'INVALID'),
    fifthAttemptLocks: locked === 'LOCKED',
    lockDeletesChallenge: expiredAfterLock === 'EXPIRED',
    correctCodeAccepted: accepted === 'OK',
    successfulCodeIsOneTime: oneTime === 'EXPIRED',
  };
  if (!Object.values(checks).every(Boolean)) throw new Error(JSON.stringify(checks));
  console.log('OTP_REDIS_INTEGRATION_OK', JSON.stringify(checks));
} finally {
  await store.cancel(key);
  await store.onModuleDestroy();
}
