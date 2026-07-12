import { mkdtemp, mkdir, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import type { PrismaClient } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { cleanupExpiredExports } from './export-builder.js';

describe('cleanupExpiredExports', () => {
  it('deletes expired files and marks their jobs expired', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'cat-diary-export-cleanup-'));
    const objectKey = 'exports/family-1/export-1.json';
    const path = join(directory, 'family-1/export-1.json');
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, '{}');
    let updateData: unknown;
    const prisma = {
      exportJob: {
        findMany: async () => [{ id: 'export-1', objectKey }],
        updateMany: async ({ data }: { data: unknown }) => {
          updateData = data;
          return { count: 1 };
        },
      },
    } as unknown as PrismaClient;
    expect(await cleanupExpiredExports(prisma, { directory }, new Date())).toEqual({
      expiredExports: 1,
    });
    await expect(stat(path)).rejects.toMatchObject({ code: 'ENOENT' });
    expect(updateData).toMatchObject({
      status: 'EXPIRED',
      objectKey: null,
      downloadTokenHash: null,
    });
  });
});
