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

export type PhotoRecordSource = {
  id: string;
  note?: string | null;
  pets?: Array<{ petId?: string; pet?: { id: string } }>;
};

export function buildGroupedPhotoRecordInputs(input: {
  clientIdFactory: () => string;
  photos: PhotoRecordSource[];
  fallbackPetIds: string[];
  fallbackNote: string;
  occurredAt: string;
}) {
  const groups = new Map<
    string,
    {
      petId: string;
      note: string;
      photoIds: string[];
    }
  >();

  for (const photo of input.photos) {
    const boundPetIds = photoBoundPetIds(photo);
    const petId =
      input.fallbackPetIds.find((candidate) => boundPetIds.includes(candidate)) ??
      boundPetIds[0] ??
      input.fallbackPetIds[0];
    if (!petId) continue;
    const note = (photo.note ?? input.fallbackNote).trim();
    const key = `${petId}\u0000${note}`;
    const group = groups.get(key) ?? { petId, note, photoIds: [] };
    group.photoIds.push(photo.id);
    groups.set(key, group);
  }

  return Array.from(groups.values()).flatMap((group) => {
    const record = buildPhotoRecordInput({
      clientId: input.clientIdFactory(),
      petIds: [group.petId],
      photoIds: group.photoIds,
      note: group.note,
      occurredAt: input.occurredAt,
    });
    return record ? [record] : [];
  });
}

export type PhotoUploadQueueOwnershipItem = { petIds: string[] };

export function restorePhotoUploadQueueOwnership<T extends PhotoUploadQueueOwnershipItem>({
  items,
  pets,
  requestedPetId,
}: {
  items: T[];
  pets: Array<Pick<PetOption, 'id'>>;
  requestedPetId?: string | null;
}) {
  const validPetIds = new Set(pets.map((pet) => pet.id));
  let invalidItemCount = 0;
  let trimmedItemCount = 0;
  const restoredItems = items.map((item) => {
    const originalPetIds = unique(item.petIds);
    const petIds = originalPetIds.filter((petId) => validPetIds.has(petId));
    if (!petIds.length) invalidItemCount += 1;
    if (petIds.length !== originalPetIds.length) trimmedItemCount += 1;
    return { ...item, petIds };
  });
  const firstRestoredPetIds = restoredItems.find((item) => item.petIds.length)?.petIds ?? [];

  return {
    items: restoredItems,
    initialPetIds: resolveInitialPhotoPetIds(pets, requestedPetId, firstRestoredPetIds),
    invalidItemCount,
    trimmedItemCount,
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
  | 'LOADING_PETS'
  | 'PET_LOAD_ERROR'
  | 'NO_PETS'
  | 'NO_PHOTOS'
  | 'INVALID_RESTORED_PHOTOS'
  | 'NO_SELECTED_PETS'
  | null;

export function resolvePhotoUploadSubmitState({
  itemCount,
  selectedPetCount,
  petCount,
  petsLoading,
  petLoadError,
  invalidRestoredPhotoCount = 0,
}: {
  itemCount: number;
  selectedPetCount: number;
  petCount: number;
  petsLoading: boolean;
  petLoadError: string;
  invalidRestoredPhotoCount?: number;
}): { canSubmit: boolean; reason: PhotoUploadSubmitBlockReason } {
  if (petsLoading) return { canSubmit: false, reason: 'LOADING_PETS' };
  if (petLoadError) return { canSubmit: false, reason: 'PET_LOAD_ERROR' };
  if (petCount === 0) return { canSubmit: false, reason: 'NO_PETS' };
  if (itemCount === 0) return { canSubmit: false, reason: 'NO_PHOTOS' };
  if (invalidRestoredPhotoCount > 0) return { canSubmit: false, reason: 'INVALID_RESTORED_PHOTOS' };
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
    case 'INVALID_RESTORED_PHOTOS':
      return '有恢复的照片原绑定猫咪已不可用，请移除后重新选择照片';
    case 'NO_SELECTED_PETS':
      return '请至少选择一只照片里的猫咪';
    default:
      return '';
  }
}

export type PhotoUploadPreviewTone = 'neutral' | 'brand' | 'success' | 'danger';

export type PhotoUploadPreviewState = 'READY' | 'UPLOADING' | 'DONE' | 'FAILED';

export type PhotoPermissionSource = 'library' | 'camera';

export function photoUploadPreviewStatus({
  state,
  progress = 0,
  error,
  queued = false,
}: {
  state: PhotoUploadPreviewState;
  progress?: number;
  error?: string | null;
  queued?: boolean;
}): { text: string; tone: PhotoUploadPreviewTone; accessibilityLabel: string } {
  if (state === 'UPLOADING') {
    const percent = Math.min(100, Math.max(0, Math.round(progress)));
    return {
      text: `上传中 ${percent}%`,
      tone: 'brand',
      accessibilityLabel: `照片上传中，进度 ${percent}%`,
    };
  }
  if (state === 'DONE') {
    return {
      text: '已上传',
      tone: 'success',
      accessibilityLabel: '照片已上传',
    };
  }
  if (state === 'FAILED') {
    const message = (error ?? '').trim();
    if (queued && (!message || message === '等待恢复上传')) {
      return {
        text: '待恢复上传，可重试',
        tone: 'danger',
        accessibilityLabel: '照片待恢复上传，可以重试',
      };
    }
    return {
      text: message ? `上传失败：${message}` : '上传失败，可重试',
      tone: 'danger',
      accessibilityLabel: message ? `照片上传失败，原因：${message}` : '照片上传失败，可以重试',
    };
  }
  return {
    text: '待上传',
    tone: 'neutral',
    accessibilityLabel: '照片待上传',
  };
}

export function photoPermissionDeniedCopy(source: PhotoPermissionSource) {
  if (source === 'camera') {
    return {
      title: '相机权限未开启',
      body: '请在系统设置中允许猫伴日记使用相机，然后返回这里重新拍照。',
      actionLabel: '打开系统设置',
    };
  }
  return {
    title: '相册权限未开启',
    body: '请在系统设置中允许猫伴日记访问照片，然后返回这里重新选择。',
    actionLabel: '打开系统设置',
  };
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

function photoBoundPetIds(photo: PhotoRecordSource) {
  return unique(
    (photo.pets ?? [])
      .map((entry) => entry.petId ?? entry.pet?.id)
      .filter((value): value is string => Boolean(value)),
  );
}
