import { describe, expect, it } from 'vitest';
import { redisConnectionFromUrl } from './index';

describe('redisConnectionFromUrl', () => {
  it('parses credentials and database for managed Redis', () => {
    expect(redisConnectionFromUrl('redis://user:p%40ss@cache.internal:6390/3')).toEqual({
      host: 'cache.internal',
      port: 6390,
      username: 'user',
      password: 'p@ss',
      db: 3,
      tls: undefined,
    });
  });

  it('enables TLS while retaining the Redis default port', () => {
    expect(redisConnectionFromUrl('rediss://cache.internal')).toMatchObject({
      host: 'cache.internal',
      port: 6379,
      tls: {},
    });
  });

  it('rejects unrelated protocols and invalid database paths', () => {
    expect(() => redisConnectionFromUrl('https://cache.internal')).toThrow(/redis:\/\//);
    expect(() => redisConnectionFromUrl('redis://cache.internal/not-a-db')).toThrow(/database/);
  });
});
