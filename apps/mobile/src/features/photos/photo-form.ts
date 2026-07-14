type PetOption = { id: string };

export function resolvePhotoFilterPetId(
  pets: Array<Pick<PetOption, 'id'>>,
  requestedPetId?: string | null,
) {
  if (requestedPetId && pets.some((pet) => pet.id === requestedPetId)) return requestedPetId;
  return '';
}

export function resolveInitialPhotoPetIds(
  pets: Array<Pick<PetOption, 'id'>>,
  requestedPetId?: string | null,
  queuedPetIds: string[] = [],
) {
  const validIds = new Set(pets.map((pet) => pet.id));
  const validQueuedIds = unique(queuedPetIds).filter((petId) => validIds.has(petId));
  if (validQueuedIds.length) return validQueuedIds;
  if (requestedPetId && validIds.has(requestedPetId)) return [requestedPetId];
  return pets[0] ? [pets[0].id] : [];
}

export function samePhotoPetSelection(left: string[], right: string[]) {
  if (left.length !== right.length) return false;
  const rightSet = new Set(right);
  return left.every((petId) => rightSet.has(petId));
}

function unique(values: string[]) {
  return Array.from(new Set(values));
}
