import { describe, expect, it } from 'vitest';
import {
  blankRecordFormValue,
  buildRecordData,
  isRecordDetailDraftDirty,
  isRecordDraftDirty,
  isRecordDraftReady,
  recordDraftSubmitBlockMessage,
  recordDraftOwnerLabel,
  recordOwnerLabel,
  recordRequiresPet,
  recordSaveFailureMessage,
  resolveInitialRecordPetId,
  resolveInitialRecordType,
  resolveRecordDraftSubmitState,
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

  it('prefills record type from a valid route value and ignores invalid routes', () => {
    expect(resolveInitialRecordType('WEIGHT')).toBe('WEIGHT');
    expect(resolveInitialRecordType('LITTER')).toBe('LITTER');
    expect(resolveInitialRecordType('PHOTO')).toBe('FOOD');
    expect(resolveInitialRecordType('')).toBe('FOOD');
    expect(resolveInitialRecordType(null)).toBe('FOOD');
  });

  it('blocks single-cat record submission until pet ownership has loaded', () => {
    const value = { ...blank, first: '主食罐', second: '80' };

    expect(
      resolveRecordDraftSubmitState({
        type: 'FOOD',
        value,
        petId: 'pet-a',
        petCount: 1,
        petsLoading: true,
        petLoadError: '',
      }),
    ).toEqual({ canSubmit: false, reason: 'LOADING_PETS' });
    expect(
      resolveRecordDraftSubmitState({
        type: 'FOOD',
        value,
        petId: null,
        petCount: 0,
        petsLoading: false,
        petLoadError: '猫咪加载失败',
      }),
    ).toEqual({ canSubmit: false, reason: 'PET_LOAD_ERROR' });
    expect(recordDraftSubmitBlockMessage('PET_LOAD_ERROR', 'FOOD')).toBe(
      '猫咪列表加载失败，请先重试确认归属',
    );
  });

  it('allows a public litter observation even when no pet can be selected', () => {
    expect(
      resolveRecordDraftSubmitState({
        type: 'FOOD',
        value: { ...blank, first: '主食罐', second: '80' },
        petId: null,
        petCount: 0,
        petsLoading: false,
        petLoadError: '',
      }),
    ).toEqual({ canSubmit: false, reason: 'NO_PETS' });
    expect(recordDraftSubmitBlockMessage('NO_PETS', 'FOOD')).toBe(
      '请先添加猫咪档案，再保存单猫记录',
    );
    expect(
      resolveRecordDraftSubmitState({
        type: 'LITTER',
        value: { ...blank, second: '公共猫砂盆已清理' },
        petId: null,
        petCount: 0,
        petsLoading: false,
        petLoadError: '网络失败',
      }),
    ).toEqual({ canSubmit: true, reason: null });
  });

  it('keeps save errors actionable without implying the record was stored', () => {
    expect(recordSaveFailureMessage('server', new Error('服务暂时不可用'))).toBe('服务暂时不可用');
    expect(recordSaveFailureMessage('server')).toBe('保存失败');
    expect(recordSaveFailureMessage('offlineQueue')).toBe(
      '本机离线队列保存失败，请稍后重试，当前草稿仍保留在页面',
    );
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

  it('detects record detail edits that need a leave confirmation', () => {
    const base = {
      value: { first: '1', second: 'UNKNOWN', blood: false },
      originalValue: { first: '1', second: 'UNKNOWN', blood: false },
      note: '精神正常',
      originalNote: '精神正常',
      abnormal: false,
      originalAbnormal: false,
      occurredDate: '2026-07-15',
      originalOccurredDate: '2026-07-15',
      occurredTime: '08:30',
      originalOccurredTime: '08:30',
    };

    expect(isRecordDetailDraftDirty(base)).toBe(false);
    expect(isRecordDetailDraftDirty({ ...base, note: '  精神正常  ' })).toBe(false);
    expect(isRecordDetailDraftDirty({ ...base, value: { ...base.value, first: '2' } })).toBe(true);
    expect(isRecordDetailDraftDirty({ ...base, abnormal: true })).toBe(true);
    expect(isRecordDetailDraftDirty({ ...base, occurredDate: '2026-07-16' })).toBe(true);
    expect(isRecordDetailDraftDirty({ ...base, occurredTime: '09:00' })).toBe(true);
  });
});
