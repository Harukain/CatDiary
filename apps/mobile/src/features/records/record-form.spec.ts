import { describe, expect, it } from 'vitest';
import {
  buildRecordData,
  isRecordDraftReady,
  recordOwnerLabel,
  recordRequiresPet,
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
});
