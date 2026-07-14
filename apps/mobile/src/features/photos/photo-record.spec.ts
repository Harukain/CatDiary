import { describe, expect, it } from 'vitest';
import { resolvePhotoRecordReadiness } from './photo-record';

const photo = (id: string) => ({ id, url: `https://example.com/${id}.jpg` });

describe('resolvePhotoRecordReadiness', () => {
  it('allows retrying timeline record creation when all photos were already uploaded', () => {
    const result = resolvePhotoRecordReadiness({
      existingItems: [{ photo: photo('photo-1') }, { photo: photo('photo-2') }],
      uploadResults: [],
      pendingCount: 0,
    });

    expect(result.ready).toBe(true);
    expect(result.photos.map((item) => item.id)).toEqual(['photo-1', 'photo-2']);
  });

  it('waits when any pending upload failed', () => {
    const result = resolvePhotoRecordReadiness({
      existingItems: [{ photo: photo('photo-1') }],
      uploadResults: [photo('photo-2'), null],
      pendingCount: 2,
    });

    expect(result.ready).toBe(false);
    if (result.ready) throw new Error('expected pending upload failure');
    expect(result.reason).toBe('UPLOAD_INCOMPLETE');
    expect(result.photos.map((item) => item.id)).toEqual(['photo-1', 'photo-2']);
  });

  it('deduplicates photos before creating the timeline record', () => {
    const result = resolvePhotoRecordReadiness({
      existingItems: [{ photo: photo('photo-1') }],
      uploadResults: [photo('photo-1'), photo('photo-2')],
      pendingCount: 2,
    });

    expect(result.ready).toBe(true);
    expect(result.photos.map((item) => item.id)).toEqual(['photo-1', 'photo-2']);
  });

  it('does not create an empty photo timeline record', () => {
    const result = resolvePhotoRecordReadiness<{ id: string }>({
      existingItems: [],
      uploadResults: [],
      pendingCount: 0,
    });

    expect(result.ready).toBe(false);
    if (result.ready) throw new Error('expected no photos');
    expect(result.reason).toBe('NO_PHOTOS');
  });
});
