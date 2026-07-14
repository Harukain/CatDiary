import { describe, expect, it } from 'vitest';
import {
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
});
