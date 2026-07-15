import { ExportFormat, ExportStatus, FamilyRole } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { ExportsService } from './exports.service';

vi.mock('bullmq', () => ({
  Queue: class {
    close = vi.fn().mockResolvedValue(undefined);
  },
}));

describe('ExportsService feature switch', () => {
  it('rejects new jobs before writing data when exports are disabled', async () => {
    const prisma = { exportJob: { create: vi.fn() } };
    const service = new ExportsService(
      prisma as never,
      {
        get: vi.fn((key: string, fallback?: unknown) =>
          key === 'FEATURE_EXPORTS_ENABLED' ? false : fallback,
        ),
      } as never,
    );

    await expect(
      service.create('family-id', 'user-id', FamilyRole.OWNER, ExportFormat.JSON),
    ).rejects.toMatchObject({ code: 'EXPORTS_TEMPORARILY_DISABLED', status: 503 });
    expect(prisma.exportJob.create).not.toHaveBeenCalled();
    await service.onModuleDestroy();
  });
});

describe('ExportsService COS signed URLs', () => {
  it('returns the callback signed download URL when the COS SDK sync return is empty', async () => {
    const prisma = {
      exportJob: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'export-id',
          familyId: 'family-id',
          requestedById: 'user-id',
          scope: 'FAMILY',
          format: ExportFormat.JSON,
          status: ExportStatus.READY,
          objectKey: 'exports/family-id/export.json',
          byteSize: 128,
          errorCode: null,
          completedAt: new Date('2026-07-15T00:00:00.000Z'),
          expiresAt: new Date('2099-01-01T00:00:00.000Z'),
          createdAt: new Date('2026-07-15T00:00:00.000Z'),
          updatedAt: new Date('2026-07-15T00:00:00.000Z'),
        }),
        update: vi.fn(),
      },
    };
    const configValues: Record<string, unknown> = {
      COS_BUCKET: 'cat-diary-test-123',
      COS_REGION: 'ap-shanghai',
      COS_SECRET_ID: 'secret-id',
      COS_SECRET_KEY: 'secret-key',
    };
    const service = new ExportsService(
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

    const result = await service.download('family-id', 'user-id', FamilyRole.OWNER, 'export-id');

    expect(result.downloadUrl).toBe('https://signed.example/GET/exports/family-id/export.json');
    expect(prisma.exportJob.update).not.toHaveBeenCalled();
    await service.onModuleDestroy();
  });
});
