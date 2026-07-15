export type CreatePetReturnTarget = 'home' | 'pets';

export function resolveCreatePetReturnTarget(returnTo?: string | string[]): CreatePetReturnTarget {
  const value = Array.isArray(returnTo) ? returnTo[0] : returnTo;
  return value === 'pets' ? 'pets' : 'home';
}

export function shouldOpenCreatedPetProfile(target: CreatePetReturnTarget) {
  return target === 'pets';
}

export function isCreatePetDraftDirty(name: string) {
  return name.trim().length > 0;
}
