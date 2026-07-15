import { describe, expect, it } from 'vitest';
import {
  isPetProfileDraftDirty,
  isValidBirthDate,
  petProfileDraftSnapshot,
  type PetProfileDraft,
} from './pet-form';

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

  it('compares against the family calendar day instead of the CI machine timezone', () => {
    const instant = new Date('2026-07-12T16:05:00.000Z');

    expect(isValidBirthDate('2026-07-13', instant, 'Asia/Shanghai')).toBe(true);
    expect(isValidBirthDate('2026-07-13', instant, 'UTC')).toBe(false);
  });

  it('rejects an invalid family timezone instead of accepting a future date', () => {
    expect(isValidBirthDate('2026-07-13', now, 'Invalid/Timezone')).toBe(false);
  });
});

const cleanDraft: PetProfileDraft = {
  name: '团团',
  sex: 'UNKNOWN',
  birthDate: '2025-04-01',
  breed: '',
  chipNumber: '',
  neutered: null,
};

describe('pet profile form rules', () => {
  it('keeps an unchanged pet profile draft clean', () => {
    expect(isPetProfileDraftDirty({ ...cleanDraft }, cleanDraft)).toBe(false);
  });

  it('normalizes editable text before comparing with saved pet profile', () => {
    expect(
      isPetProfileDraftDirty(
        { ...cleanDraft, name: '  团团 ', breed: '  ', chipNumber: ' ' },
        cleanDraft,
      ),
    ).toBe(false);
    expect(petProfileDraftSnapshot(cleanDraft)).toBe(
      petProfileDraftSnapshot({ ...cleanDraft, name: ' 团团 ' }),
    );
  });

  it('treats profile field changes as dirty edits', () => {
    expect(isPetProfileDraftDirty({ ...cleanDraft, name: '圆圆' }, cleanDraft)).toBe(true);
    expect(isPetProfileDraftDirty({ ...cleanDraft, sex: 'FEMALE' }, cleanDraft)).toBe(true);
    expect(isPetProfileDraftDirty({ ...cleanDraft, birthDate: '2025-04-02' }, cleanDraft)).toBe(
      true,
    );
    expect(isPetProfileDraftDirty({ ...cleanDraft, breed: '英短' }, cleanDraft)).toBe(true);
    expect(isPetProfileDraftDirty({ ...cleanDraft, chipNumber: '985112' }, cleanDraft)).toBe(true);
    expect(isPetProfileDraftDirty({ ...cleanDraft, neutered: true }, cleanDraft)).toBe(true);
  });
});
