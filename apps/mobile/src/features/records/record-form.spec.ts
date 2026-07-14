import { describe, expect, it } from 'vitest';
import {
  blankRecordFormValue,
  buildRecordData,
  isRecordDraftDirty,
  isRecordDraftReady,
  recordDraftOwnerLabel,
  recordOwnerLabel,
  recordRequiresPet,
  resolveInitialRecordPetId,
  type RecordFormValue,
} from './record-form';

const blank: RecordFormValue = { first: '', second: '', blood: false };

describe('record form rules', () => {
  it('requires a concrete pet for single-cat records but not public litter observations', () => {
    expect(recordRequiresPet('FOOD')).toBe(true);
    expect(recordRequiresPet('WEIGHT')).toBe(true);
    expect(recordRequiresPet('LITTER')).toBe(false);
    expect(isRecordDraftReady('FOOD', { ...blank, first: '主食罐', second: '80' }, null)).toBe(
      false,
    );
    expect(isRecordDraftReady('LITTER', { ...blank, second: '已清理' }, null)).toBe(true);
  });

  it('keeps litter submit disabled until a box or observation is provided', () => {
    expect(isRecordDraftReady('LITTER', blank, null)).toBe(false);
    expect(() => buildRecordData('LITTER', blank)).toThrow('请填写猫砂盆或观察内容');
    expect(buildRecordData('LITTER', { ...blank, first: '客厅猫砂盆' })).toEqual({
      boxId: '客厅猫砂盆',
      observation: undefined,
    });
  });

  it('uses an explicit public litter box label for unscoped litter records', () => {
    expect(recordOwnerLabel({ type: 'LITTER', pet: null })).toBe('公共猫砂盆');
    expect(recordOwnerLabel({ type: 'FOOD', pet: null })).toBe('家庭');
    expect(recordOwnerLabel({ type: 'LITTER', pet: { id: 'pet-id', name: '福宝' } })).toBe('福宝');
  });

  it('prefills record ownership from a valid route pet and falls back safely', () => {
    const pets = [
      { id: 'pet-a', name: '福宝' },
      { id: 'pet-b', name: '年糕' },
    ];

    expect(resolveInitialRecordPetId(pets, 'pet-b')).toBe('pet-b');
    expect(resolveInitialRecordPetId(pets, 'missing')).toBe('pet-a');
    expect(resolveInitialRecordPetId([], 'pet-b')).toBeNull();
    expect(recordDraftOwnerLabel('FOOD', pets, 'pet-b')).toBe('年糕');
    expect(recordDraftOwnerLabel('FOOD', pets, null)).toBe('未选择猫咪');
    expect(recordDraftOwnerLabel('LITTER', pets, null)).toBe('公共猫砂盆');
  });

  it('does not treat the initial blank record as dirty', () => {
    expect(
      isRecordDraftDirty({
        type: 'FOOD',
        value: blankRecordFormValue('FOOD'),
        note: '',
        abnormal: false,
        occurredDate: '2026-07-15',
        occurredTime: '08:30',
        initialOccurredDate: '2026-07-15',
        initialOccurredTime: '08:30',
      }),
    ).toBe(false);
  });

  it('treats type, content, abnormal state and time changes as dirty', () => {
    const base = {
      type: 'FOOD' as const,
      value: blankRecordFormValue('FOOD'),
      note: '',
      abnormal: false,
      occurredDate: '2026-07-15',
      occurredTime: '08:30',
      initialOccurredDate: '2026-07-15',
      initialOccurredTime: '08:30',
    };

    expect(
      isRecordDraftDirty({ ...base, type: 'STOOL', value: blankRecordFormValue('STOOL') }),
    ).toBe(true);
    expect(isRecordDraftDirty({ ...base, value: { ...base.value, first: '主食罐' } })).toBe(true);
    expect(isRecordDraftDirty({ ...base, note: '精神不错' })).toBe(true);
    expect(isRecordDraftDirty({ ...base, abnormal: true })).toBe(true);
    expect(isRecordDraftDirty({ ...base, occurredTime: '09:00' })).toBe(true);
  });
});
