import { describe, expect, it } from 'vitest';
import {
  isMedicalRecordDetailDraftDirty,
  isMedicalRecordDraftDirty,
  type MedicalRecordDetailDraft,
  type MedicalRecordDraft,
} from './medical-form';

const cleanDraft: MedicalRecordDraft = {
  petId: 'pet-a',
  type: 'VACCINE',
  title: '',
  occurredDate: '2026-07-15',
  nextDate: '',
  brand: '',
  batch: '',
  dose: '',
  provider: '',
  reaction: '',
  note: '',
};
const initial = {
  petId: cleanDraft.petId,
  type: cleanDraft.type,
  occurredDate: cleanDraft.occurredDate,
};

describe('medical form rules', () => {
  it('does not treat the initial blank medical record as dirty', () => {
    expect(isMedicalRecordDraftDirty(cleanDraft, initial)).toBe(false);
  });

  it('treats ownership, type, date and field content as dirty changes', () => {
    expect(isMedicalRecordDraftDirty({ ...cleanDraft, petId: 'pet-b' }, initial)).toBe(true);
    expect(isMedicalRecordDraftDirty({ ...cleanDraft, type: 'DEWORMING' }, initial)).toBe(true);
    expect(isMedicalRecordDraftDirty({ ...cleanDraft, occurredDate: '2026-07-16' }, initial)).toBe(
      true,
    );
    expect(isMedicalRecordDraftDirty({ ...cleanDraft, title: '猫三联' }, initial)).toBe(true);
    expect(isMedicalRecordDraftDirty({ ...cleanDraft, nextDate: '2027-07-15' }, initial)).toBe(
      true,
    );
    expect(isMedicalRecordDraftDirty({ ...cleanDraft, brand: '妙三多' }, initial)).toBe(true);
    expect(isMedicalRecordDraftDirty({ ...cleanDraft, note: '轻微嗜睡' }, initial)).toBe(true);
  });

  it('detects medical record detail edits against the saved baseline', () => {
    const saved: MedicalRecordDetailDraft = {
      title: '猫三联',
      occurredDate: '2026-07-15',
      nextDate: '2027-07-15',
      brand: '妙三多',
      batchNumber: 'B-1',
      dose: '1 支',
      provider: '安心宠物医院',
      reaction: '轻微嗜睡',
      note: '观察 24 小时',
    };

    expect(isMedicalRecordDetailDraftDirty(saved, saved)).toBe(false);
    expect(isMedicalRecordDetailDraftDirty({ ...saved, title: '  猫三联  ' }, saved)).toBe(false);
    expect(isMedicalRecordDetailDraftDirty({ ...saved, dose: '0.5 支' }, saved)).toBe(true);
    expect(isMedicalRecordDetailDraftDirty({ ...saved, nextDate: '' }, saved)).toBe(true);
    expect(isMedicalRecordDetailDraftDirty({ ...saved, note: '复查后正常' }, saved)).toBe(true);
  });
});
