import { describe, expect, it } from 'vitest';
import {
  buildPhotoRecordInput,
  isPhotoUploadDraftDirty,
  resolveInitialPhotoPetIds,
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

  it('detects photo upload drafts that need a leave confirmation', () => {
    const base = { itemCount: 0, note: '', petIds: ['pet-a'], initialPetIds: ['pet-a'] };

    expect(isPhotoUploadDraftDirty(base)).toBe(false);
    expect(isPhotoUploadDraftDirty({ ...base, itemCount: 1 })).toBe(true);
    expect(isPhotoUploadDraftDirty({ ...base, note: '晒太阳' })).toBe(true);
    expect(isPhotoUploadDraftDirty({ ...base, petIds: ['pet-b'] })).toBe(true);
    expect(isPhotoUploadDraftDirty({ ...base, petIds: ['pet-b', 'pet-a'] })).toBe(true);
    expect(isPhotoUploadDraftDirty({ ...base, petIds: ['pet-a'] })).toBe(false);
  });
});
