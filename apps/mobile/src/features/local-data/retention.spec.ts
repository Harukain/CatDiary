import { describe, expect, it } from 'vitest';
import {
  isPastRetention,
  ORPHAN_PHOTO_RETENTION_MS,
  RECORD_CACHE_RETENTION_MS,
  TASK_CACHE_RETENTION_MS,
} from './retention';

describe('local sensitive data retention', () => {
  const now = Date.parse('2026-07-12T10:00:00.000Z');

  it('expires record cache only after ninety days', () => {
    expect(
      isPastRetention(now - RECORD_CACHE_RETENTION_MS - 1, RECORD_CACHE_RETENTION_MS, now),
    ).toBe(true);
    expect(isPastRetention(now - RECORD_CACHE_RETENTION_MS, RECORD_CACHE_RETENTION_MS, now)).toBe(
      false,
    );
  });

  it('expires unreferenced photo copies after twenty-four hours', () => {
    expect(
      isPastRetention(now - ORPHAN_PHOTO_RETENTION_MS - 1, ORPHAN_PHOTO_RETENTION_MS, now),
    ).toBe(true);
  });

  it('expires time-sensitive task cache after seven days', () => {
    expect(isPastRetention(now - TASK_CACHE_RETENTION_MS - 1, TASK_CACHE_RETENTION_MS, now)).toBe(
      true,
    );
  });

  it('does not delete files whose modification time is unavailable', () => {
    expect(isPastRetention(undefined, ORPHAN_PHOTO_RETENTION_MS, now)).toBe(false);
  });
});
