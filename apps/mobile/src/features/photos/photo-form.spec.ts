import { describe, expect, it } from 'vitest';
import {
  buildGroupedPhotoRecordInputs,
  buildPhotoRecordInput,
  isPhotoDetailDraftDirty,
  isPhotoUploadDraftDirty,
  photoAlbumGridLayout,
  photoUploadSubmitBlockMessage,
  remainingPhotoSlots,
  resolveInitialPhotoPetIds,
  resolvePhotoUploadSubmitState,
  resolvePhotoFilterPetId,
  samePhotoPetSelection,
} from './photo-form';

const pets = [
  { id: 'pet-a', name: '福宝' },
  { id: 'pet-b', name: '年糕' },
  { id: 'pet-c', name: '团子' },
];

describe('photo form pet context rules', () => {
  it('keeps a valid route pet as album filter and rejects invalid filters', () => {
    expect(resolvePhotoFilterPetId(pets, 'pet-b')).toBe('pet-b');
    expect(resolvePhotoFilterPetId(pets, 'missing')).toBe('');
    expect(resolvePhotoFilterPetId(pets, null)).toBe('');
  });

  it('prefills upload ownership from queued metadata before route context', () => {
    expect(resolveInitialPhotoPetIds(pets, 'pet-b', ['pet-c', 'missing', 'pet-c'])).toEqual([
      'pet-c',
    ]);
  });

  it('prefills upload ownership from route context or first pet safely', () => {
    expect(resolveInitialPhotoPetIds(pets, 'pet-b')).toEqual(['pet-b']);
    expect(resolveInitialPhotoPetIds(pets, 'missing')).toEqual(['pet-a']);
    expect(resolveInitialPhotoPetIds([], 'pet-b')).toEqual([]);
  });

  it('compares pet selections as sets', () => {
    expect(samePhotoPetSelection(['pet-a', 'pet-b'], ['pet-b', 'pet-a'])).toBe(true);
    expect(samePhotoPetSelection(['pet-a'], ['pet-a', 'pet-b'])).toBe(false);
  });

  it('builds a timeline record for uploaded photos using the primary selected pet', () => {
    expect(
      buildPhotoRecordInput({
        clientId: 'client-id',
        petIds: ['pet-b', 'pet-a'],
        photoIds: ['photo-a', 'photo-b', 'photo-a'],
        note: '  阳台晒太阳  ',
        occurredAt: '2026-07-15T00:00:00.000Z',
      }),
    ).toEqual({
      clientId: 'client-id',
      petId: 'pet-b',
      type: 'PHOTO',
      title: '照片记录 · 2 张',
      occurredAt: '2026-07-15T00:00:00.000Z',
      abnormal: false,
      data: { photoIds: ['photo-a', 'photo-b'] },
      note: '阳台晒太阳',
    });
  });

  it('does not build a photo timeline record without a pet or photo', () => {
    expect(
      buildPhotoRecordInput({
        clientId: 'client-id',
        petIds: [],
        photoIds: ['photo-a'],
        note: '',
        occurredAt: '2026-07-15T00:00:00.000Z',
      }),
    ).toBeNull();
    expect(
      buildPhotoRecordInput({
        clientId: 'client-id',
        petIds: ['pet-a'],
        photoIds: [],
        note: '',
        occurredAt: '2026-07-15T00:00:00.000Z',
      }),
    ).toBeNull();
  });

  it('groups uploaded photos into timeline records by bound pet and note', () => {
    let counter = 0;
    const records = buildGroupedPhotoRecordInputs({
      clientIdFactory: () => `client-${++counter}`,
      fallbackPetIds: ['pet-a'],
      fallbackNote: '当前备注',
      occurredAt: '2026-07-15T00:00:00.000Z',
      photos: [
        {
          id: 'photo-a',
          note: '晒太阳',
          pets: [{ petId: 'pet-a' }],
        },
        {
          id: 'photo-b',
          note: '晒太阳',
          pets: [{ petId: 'pet-a' }, { petId: 'pet-b' }],
        },
        {
          id: 'photo-c',
          note: '吃饭',
          pets: [{ petId: 'pet-b' }],
        },
      ],
    });

    expect(records).toEqual([
      {
        clientId: 'client-1',
        petId: 'pet-a',
        type: 'PHOTO',
        title: '照片记录 · 2 张',
        occurredAt: '2026-07-15T00:00:00.000Z',
        abnormal: false,
        data: { photoIds: ['photo-a', 'photo-b'] },
        note: '晒太阳',
      },
      {
        clientId: 'client-2',
        petId: 'pet-b',
        type: 'PHOTO',
        title: '照片记录',
        occurredAt: '2026-07-15T00:00:00.000Z',
        abnormal: false,
        data: { photoIds: ['photo-c'] },
        note: '吃饭',
      },
    ]);
  });

  it('uses route/page ownership only when uploaded photo metadata has no bound pet', () => {
    const records = buildGroupedPhotoRecordInputs({
      clientIdFactory: () => 'client-id',
      fallbackPetIds: ['pet-b'],
      fallbackNote: '页面备注',
      occurredAt: '2026-07-15T00:00:00.000Z',
      photos: [{ id: 'photo-a', pets: [] }],
    });

    expect(records).toEqual([
      {
        clientId: 'client-id',
        petId: 'pet-b',
        type: 'PHOTO',
        title: '照片记录',
        occurredAt: '2026-07-15T00:00:00.000Z',
        abnormal: false,
        data: { photoIds: ['photo-a'] },
        note: '页面备注',
      },
    ]);
  });

  it('detects photo upload drafts that need a leave confirmation', () => {
    const base = { itemCount: 0, note: '', petIds: ['pet-a'], initialPetIds: ['pet-a'] };

    expect(isPhotoUploadDraftDirty(base)).toBe(false);
    expect(isPhotoUploadDraftDirty({ ...base, itemCount: 1 })).toBe(true);
    expect(isPhotoUploadDraftDirty({ ...base, note: '晒太阳' })).toBe(true);
    expect(isPhotoUploadDraftDirty({ ...base, petIds: ['pet-b'] })).toBe(true);
    expect(isPhotoUploadDraftDirty({ ...base, petIds: ['pet-b', 'pet-a'] })).toBe(true);
    expect(isPhotoUploadDraftDirty({ ...base, petIds: ['pet-a'] })).toBe(false);
  });

  it('detects photo detail edits that need a leave confirmation', () => {
    const base = {
      note: '晒太阳',
      originalNote: '晒太阳',
      petIds: ['pet-a', 'pet-b'],
      originalPetIds: ['pet-b', 'pet-a'],
    };

    expect(isPhotoDetailDraftDirty(base)).toBe(false);
    expect(isPhotoDetailDraftDirty({ ...base, note: '  晒太阳  ' })).toBe(false);
    expect(isPhotoDetailDraftDirty({ ...base, note: '晒太阳和打盹' })).toBe(true);
    expect(isPhotoDetailDraftDirty({ ...base, petIds: ['pet-a'] })).toBe(true);
    expect(isPhotoDetailDraftDirty({ ...base, petIds: ['pet-a', 'pet-c'] })).toBe(true);
  });

  it('calculates remaining upload slots without exceeding the photo limit', () => {
    expect(remainingPhotoSlots(0)).toBe(9);
    expect(remainingPhotoSlots(8)).toBe(1);
    expect(remainingPhotoSlots(9)).toBe(0);
    expect(remainingPhotoSlots(12)).toBe(0);
  });

  it('blocks photo upload until ownership and photos are ready', () => {
    expect(
      resolvePhotoUploadSubmitState({
        itemCount: 1,
        selectedPetCount: 1,
        petCount: 1,
        petsLoading: true,
        petLoadError: '',
      }),
    ).toEqual({ canSubmit: false, reason: 'LOADING_PETS' });
    expect(
      resolvePhotoUploadSubmitState({
        itemCount: 1,
        selectedPetCount: 0,
        petCount: 0,
        petsLoading: false,
        petLoadError: '猫咪加载失败',
      }),
    ).toEqual({ canSubmit: false, reason: 'PET_LOAD_ERROR' });
    expect(
      resolvePhotoUploadSubmitState({
        itemCount: 1,
        selectedPetCount: 0,
        petCount: 0,
        petsLoading: false,
        petLoadError: '',
      }),
    ).toEqual({ canSubmit: false, reason: 'NO_PETS' });
    expect(photoUploadSubmitBlockMessage('NO_PETS')).toBe('请先添加猫咪档案，再上传照片');
  });

  it('requires both at least one photo and at least one selected pet before uploading', () => {
    expect(
      resolvePhotoUploadSubmitState({
        itemCount: 0,
        selectedPetCount: 1,
        petCount: 1,
        petsLoading: false,
        petLoadError: '',
      }),
    ).toEqual({ canSubmit: false, reason: 'NO_PHOTOS' });
    expect(
      resolvePhotoUploadSubmitState({
        itemCount: 1,
        selectedPetCount: 0,
        petCount: 1,
        petsLoading: false,
        petLoadError: '',
      }),
    ).toEqual({ canSubmit: false, reason: 'NO_SELECTED_PETS' });
    expect(
      resolvePhotoUploadSubmitState({
        itemCount: 1,
        selectedPetCount: 1,
        petCount: 1,
        petsLoading: false,
        petLoadError: '',
      }),
    ).toEqual({ canSubmit: true, reason: null });
  });

  it('keeps the album two-column grid within mobile widths', () => {
    for (const screenWidth of [360, 375, 390, 420]) {
      const layout = photoAlbumGridLayout({ screenWidth, horizontalPadding: 20, gap: 12 });

      expect(layout.contentWidth).toBe(screenWidth - 40);
      expect(layout.columnWidth * 2 + 12).toBeLessThanOrEqual(layout.contentWidth);
      expect(layout.columnWidth).toBeGreaterThanOrEqual(154);
    }
  });
});
