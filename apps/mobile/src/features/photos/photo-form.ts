type PetOption = { id: string };

export const PHOTO_UPLOAD_LIMIT = 9;

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

export function buildPhotoRecordInput(input: {
  clientId: string;
  petIds: string[];
  photoIds: string[];
  note: string;
  occurredAt: string;
}) {
  const petId = input.petIds[0];
  const photoIds = unique(input.photoIds);
  if (!petId || !photoIds.length) return null;
  return {
    clientId: input.clientId,
    petId,
    type: 'PHOTO' as const,
    title: photoIds.length === 1 ? '照片记录' : `照片记录 · ${photoIds.length} 张`,
    occurredAt: input.occurredAt,
    abnormal: false,
    data: { photoIds },
    note: input.note.trim() || undefined,
  };
}

export function isPhotoUploadDraftDirty({
  itemCount,
  note,
  petIds,
  initialPetIds,
}: {
  itemCount: number;
  note: string;
  petIds: string[];
  initialPetIds: string[];
}) {
  return itemCount > 0 || note.trim() !== '' || !samePhotoPetSelection(petIds, initialPetIds);
}

export function remainingPhotoSlots(itemCount: number, limit = PHOTO_UPLOAD_LIMIT) {
  return Math.max(0, limit - itemCount);
}

function unique(values: string[]) {
  return Array.from(new Set(values));
}
