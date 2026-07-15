import { describe, expect, it } from 'vitest';
import {
  isCreatePetDraftDirty,
  resolveCreatePetReturnTarget,
  shouldOpenCreatedPetProfile,
} from './create-pet-flow';

describe('create pet flow rules', () => {
  it('defaults first-pet onboarding to the home flow', () => {
    expect(resolveCreatePetReturnTarget()).toBe('home');
    expect(resolveCreatePetReturnTarget('unknown')).toBe('home');
    expect(shouldOpenCreatedPetProfile('home')).toBe(false);
  });

  it('keeps management entry points returning through the pet profile flow', () => {
    expect(resolveCreatePetReturnTarget('pets')).toBe('pets');
    expect(resolveCreatePetReturnTarget(['pets', 'home'])).toBe('pets');
    expect(shouldOpenCreatedPetProfile('pets')).toBe(true);
  });

  it('treats a typed pet name as a dirty draft', () => {
    expect(isCreatePetDraftDirty('')).toBe(false);
    expect(isCreatePetDraftDirty('   ')).toBe(false);
    expect(isCreatePetDraftDirty('团团')).toBe(true);
  });
});
