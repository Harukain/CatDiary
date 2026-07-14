export type PhotoRecordCandidate<TPhoto extends { id: string }> = {
  photo?: TPhoto | null;
};

export type PhotoRecordReadiness<TPhoto extends { id: string }> =
  | {
      ready: true;
      photos: TPhoto[];
    }
  | {
      ready: false;
      reason: 'NO_PHOTOS' | 'UPLOAD_INCOMPLETE';
      photos: TPhoto[];
    };

export function resolvePhotoRecordReadiness<TPhoto extends { id: string }>({
  existingItems,
  uploadResults,
  pendingCount,
}: {
  existingItems: ReadonlyArray<PhotoRecordCandidate<TPhoto>>;
  uploadResults: ReadonlyArray<TPhoto | null>;
  pendingCount: number;
}): PhotoRecordReadiness<TPhoto> {
  const photos = dedupePhotos([
    ...existingItems.flatMap((item) => (item.photo ? [item.photo] : [])),
    ...uploadResults.filter((photo): photo is TPhoto => Boolean(photo)),
  ]);
  if (!photos.length) return { ready: false, reason: 'NO_PHOTOS', photos };
  const pendingUploadsSucceeded =
    pendingCount === 0 ||
    (uploadResults.length === pendingCount && uploadResults.every((photo) => Boolean(photo)));
  if (!pendingUploadsSucceeded) return { ready: false, reason: 'UPLOAD_INCOMPLETE', photos };
  return { ready: true, photos };
}

function dedupePhotos<TPhoto extends { id: string }>(photos: ReadonlyArray<TPhoto>) {
  const seen = new Set<string>();
  const result: TPhoto[] = [];
  for (const photo of photos) {
    if (seen.has(photo.id)) continue;
    seen.add(photo.id);
    result.push(photo);
  }
  return result;
}
