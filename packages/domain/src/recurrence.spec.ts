import { describe, expect, it } from 'vitest';
import {
  classifyOfflineFailure,
  generateOccurrences,
  isCalendarDateOnOrBefore,
  isValidCalendarDate,
} from './index';

describe('generateOccurrences', () => {
  it('generates daily occurrences in the plan timezone', () => {
    const result = generateOccurrences({
      startAt: new Date('2026-07-12T00:00:00.000Z'),
      timezone: 'Asia/Shanghai',
      localTime: '08:30',
      rule: { frequency: 'daily' },
      from: new Date('2026-07-12T00:00:00.000Z'),
      to: new Date('2026-07-14T23:59:59.000Z'),
    });
    expect(result.map((value) => value.toISOString())).toEqual([
      '2026-07-12T00:30:00.000Z',
      '2026-07-13T00:30:00.000Z',
      '2026-07-14T00:30:00.000Z',
    ]);
  });

  it('honors weekdays and weekly intervals', () => {
    const result = generateOccurrences({
      startAt: new Date('2026-07-06T00:00:00.000Z'),
      timezone: 'Asia/Shanghai',
      localTime: '09:00',
      rule: { frequency: 'weekly', interval: 2, weekdays: [1, 3] },
      from: new Date('2026-07-05T16:00:00.000Z'),
      to: new Date('2026-07-20T15:59:59.000Z'),
    });
    expect(result.map((value) => value.toISOString())).toEqual([
      '2026-07-06T01:00:00.000Z',
      '2026-07-08T01:00:00.000Z',
      '2026-07-20T01:00:00.000Z',
    ]);
  });

  it('generates a one-off occurrence when the scheduled minute is on the next local day', () => {
    const result = generateOccurrences({
      startAt: new Date('2026-07-17T16:22:00.000Z'),
      timezone: 'Asia/Shanghai',
      localTime: '00:22',
      rule: { frequency: 'once' },
      from: new Date('2026-07-17T15:52:00.000Z'),
      to: new Date('2026-07-24T15:52:00.000Z'),
    });

    expect(result.map((value) => value.toISOString())).toEqual(['2026-07-17T16:22:00.000Z']);
  });

  it('does not clamp a monthly day into shorter months', () => {
    const result = generateOccurrences({
      startAt: new Date('2026-01-31T00:00:00.000Z'),
      timezone: 'UTC',
      localTime: '10:00',
      rule: { frequency: 'monthly', dayOfMonth: 31 },
      from: new Date('2026-01-01T00:00:00.000Z'),
      to: new Date('2026-03-31T23:59:59.000Z'),
    });
    expect(result.map((value) => value.toISOString())).toEqual([
      '2026-01-31T10:00:00.000Z',
      '2026-03-31T10:00:00.000Z',
    ]);
  });
});

describe('classifyOfflineFailure', () => {
  it('routes optimistic-lock and idempotency collisions to manual conflict handling', () => {
    expect(classifyOfflineFailure('VERSION_CONFLICT')).toBe('CONFLICT');
    expect(classifyOfflineFailure('TASK_ALREADY_COMPLETED')).toBe('CONFLICT');
    expect(classifyOfflineFailure('IDEMPOTENCY_KEY_REUSED')).toBe('CONFLICT');
  });

  it('keeps temporary service and session failures pending for a later replay', () => {
    expect(classifyOfflineFailure('INTERNAL_ERROR')).toBe('RETRY_LATER');
    expect(classifyOfflineFailure('RATE_LIMITED')).toBe('RETRY_LATER');
    expect(classifyOfflineFailure('SESSION_EXPIRED')).toBe('RETRY_LATER');
  });

  it('marks invalid operations as failed so they do not loop forever', () => {
    expect(classifyOfflineFailure('VALIDATION_ERROR')).toBe('FAILED');
    expect(classifyOfflineFailure('RECORD_NOT_FOUND')).toBe('FAILED');
  });
});

describe('calendar date validation', () => {
  it('validates leap days without JavaScript date normalization', () => {
    expect(isValidCalendarDate('2024-02-29')).toBe(true);
    expect(isValidCalendarDate('2026-02-29')).toBe(false);
    expect(isValidCalendarDate('2026-13-01')).toBe(false);
  });

  it('compares dates in the family timezone at a UTC day boundary', () => {
    const instant = new Date('2026-07-12T16:05:00.000Z');

    expect(isCalendarDateOnOrBefore('2026-07-13', instant, 'Asia/Shanghai')).toBe(true);
    expect(isCalendarDateOnOrBefore('2026-07-13', instant, 'UTC')).toBe(false);
    expect(isCalendarDateOnOrBefore('2026-07-13', instant, 'Invalid/Timezone')).toBe(false);
  });
});
