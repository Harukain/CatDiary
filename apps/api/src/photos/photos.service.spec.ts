import { UploadPurpose } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { PhotosService } from './photos.service';

function serviceWithCos(prisma: unknown = { uploadIntent: { create: vi.fn() } }) {
  const configValues: Record<string, unknown> = {
    COS_BUCKET: 'cat-diary-test-123',
    COS_REGION: 'ap-shanghai',
    COS_SECRET_ID: 'secret-id',
    COS_SECRET_KEY: 'secret-key',
  };
  const service = new PhotosService(
    prisma as never,
    {
      get: vi.fn((key: string, fallback?: unknown) => configValues[key] ?? fallback),
    } as never,
  );
  const getObjectUrl = vi.fn((params: { Method: string; Key: string }, callback?: unknown) => {
    if (typeof callback === 'function')
      callback(null, { Url: `https://signed.example/${params.Method}/${params.Key}` });
    return undefined;
  });
  (service as unknown as { cos: unknown }).cos = { getObjectUrl };
  return { service, getObjectUrl };
}

describe('PhotosService COS signed URLs', () => {
  it('returns the callback signed upload URL when the COS SDK sync return is empty', async () => {
    const prisma = { uploadIntent: { create: vi.fn().mockResolvedValue({ id: 'intent-id' }) } };
    const { service, getObjectUrl } = serviceWithCos(prisma);

    const result = await service.presign('family-id', 'user-id', {
      fileName: 'cat.png',
      mimeType: 'image/png',
      byteSize: 128,
      purpose: UploadPurpose.PHOTO,
    });

    expect(result.provider).toBe('COS');
    expect(result.uploadUrl).toBe(`https://signed.example/PUT/${result.objectKey}`);
    expect(result.headers).toEqual({ 'Content-Type': 'image/png' });
    expect(getObjectUrl).toHaveBeenCalledWith(
      expect.objectContaining({ Method: 'PUT', Key: result.objectKey }),
    );
    expect(prisma.uploadIntent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        familyId: 'family-id',
        userId: 'user-id',
        objectKey: result.objectKey,
        mimeType: 'image/png',
        byteSize: 128,
        purpose: UploadPurpose.PHOTO,
      }),
    });
  });

  it('uses callback signed download URLs for record photo summaries', async () => {
    const { service } = serviceWithCos();

    const result = await service.recordSummary({
      id: 'photo-id',
      objectKey: 'families/family-id/photos/raw.png',
      thumbnailObjectKey: 'families/family-id/thumbnails/thumb.png',
      width: 1200,
      height: 900,
      note: '晒太阳',
      createdAt: new Date('2026-07-15T00:00:00.000Z'),
    });

    expect(result).toMatchObject({
      id: 'photo-id',
      downloadUrl: 'https://signed.example/GET/families/family-id/photos/raw.png',
      thumbnailUrl: 'https://signed.example/GET/families/family-id/thumbnails/thumb.png',
      width: 1200,
      height: 900,
      note: '晒太阳',
    });
  });
});
