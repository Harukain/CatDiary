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

export function isPhotoDetailDraftDirty({
  note,
  originalNote,
  petIds,
  originalPetIds,
}: {
  note: string;
  originalNote?: string | null;
  petIds: string[];
  originalPetIds: string[];
}) {
  return (
    note.trim() !== (originalNote ?? '').trim() || !samePhotoPetSelection(petIds, originalPetIds)
  );
}

export function remainingPhotoSlots(itemCount: number, limit = PHOTO_UPLOAD_LIMIT) {
  return Math.max(0, limit - itemCount);
}

export type PhotoUploadSubmitBlockReason =
  'LOADING_PETS' | 'PET_LOAD_ERROR' | 'NO_PETS' | 'NO_PHOTOS' | 'NO_SELECTED_PETS' | null;

export function resolvePhotoUploadSubmitState({
  itemCount,
  selectedPetCount,
  petCount,
  petsLoading,
  petLoadError,
}: {
  itemCount: number;
  selectedPetCount: number;
  petCount: number;
  petsLoading: boolean;
  petLoadError: string;
}): { canSubmit: boolean; reason: PhotoUploadSubmitBlockReason } {
  if (petsLoading) return { canSubmit: false, reason: 'LOADING_PETS' };
  if (petLoadError) return { canSubmit: false, reason: 'PET_LOAD_ERROR' };
  if (petCount === 0) return { canSubmit: false, reason: 'NO_PETS' };
  if (itemCount === 0) return { canSubmit: false, reason: 'NO_PHOTOS' };
  if (selectedPetCount === 0) return { canSubmit: false, reason: 'NO_SELECTED_PETS' };
  return { canSubmit: true, reason: null };
}

export function photoUploadSubmitBlockMessage(reason: PhotoUploadSubmitBlockReason) {
  switch (reason) {
    case 'LOADING_PETS':
      return '正在确认照片归属，请稍后再上传';
    case 'PET_LOAD_ERROR':
      return '猫咪列表加载失败，请先重试确认照片归属';
    case 'NO_PETS':
      return '请先添加猫咪档案，再上传照片';
    case 'NO_PHOTOS':
      return '请先选择照片';
    case 'NO_SELECTED_PETS':
      return '请至少选择一只照片里的猫咪';
    default:
      return '';
  }
}

export function photoAlbumGridLayout({
  screenWidth,
  horizontalPadding,
  gap,
}: {
  screenWidth: number;
  horizontalPadding: number;
  gap: number;
}) {
  const contentWidth = Math.max(0, Math.floor(screenWidth - horizontalPadding * 2));
  const columnWidth = Math.max(0, Math.floor((contentWidth - gap) / 2));
  return {
    contentWidth,
    columnWidth,
  };
}

function unique(values: string[]) {
  return Array.from(new Set(values));
}
