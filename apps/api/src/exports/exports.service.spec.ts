import { ExportFormat, FamilyRole } from '@prisma/client';
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
