import { describe, expect, it } from 'vitest';
import { isAccountDeletionDraftDirty, sanitizeDeletionCode } from './account-deletion-form';

describe('account deletion form rules', () => {
  it('normalizes deletion codes to six digits', () => {
    expect(sanitizeDeletionCode('12 34-56')).toBe('123456');
    expect(sanitizeDeletionCode('abc123456789')).toBe('123456');
  });

  it('keeps an untouched deletion request draft clean', () => {
    expect(isAccountDeletionDraftDirty({ code: '', maskedPhone: '' })).toBe(false);
  });

  it('treats an entered code or sent phone target as an in-progress deletion request draft', () => {
    expect(isAccountDeletionDraftDirty({ code: '123456', maskedPhone: '' })).toBe(true);
    expect(isAccountDeletionDraftDirty({ code: '', maskedPhone: '138****5678' })).toBe(true);
  });
});
