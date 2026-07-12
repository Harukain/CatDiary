import { describe, expect, it } from 'vitest';
import { isValidBirthDate } from './pet-form';

describe('isValidBirthDate', () => {
  const now = new Date('2026-07-13T00:05:00+08:00');

  it('accepts a real date that is not in the future', () => {
    expect(isValidBirthDate('2024-02-29', now)).toBe(true);
    expect(isValidBirthDate('2026-07-13', now)).toBe(true);
  });

  it('rejects invalid or future calendar dates', () => {
    expect(isValidBirthDate('2026-02-29', now)).toBe(false);
    expect(isValidBirthDate('2026-13-01', now)).toBe(false);
    expect(isValidBirthDate('2026-07-14', now)).toBe(false);
    expect(isValidBirthDate('2026/07/13', now)).toBe(false);
  });
});
