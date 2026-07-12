import { describe, expect, it } from 'vitest';
import { hashRequest } from './idempotency.service';

describe('hashRequest', () => {
  it('is stable across object key order and changes with payload', () => {
    expect(hashRequest({ b: 2, a: 1 })).toBe(hashRequest({ a: 1, b: 2 }));
    expect(hashRequest({ a: 1 })).not.toBe(hashRequest({ a: 2 }));
  });
});
