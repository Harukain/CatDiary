import { mkdtemp, mkdir, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import type { PrismaClient } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { cleanupExpiredExports, exportStorageFromEnvironment } from './export-builder.js';

function withEnv(name: string, value: string | undefined, assertion: () => void) {
  const previous = process.env[name];
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
  try {
    assertion();
  } finally {
    if (previous === undefined) delete process.env[name];
    else process.env[name] = previous;
  }
}

describe('exportStorageFromEnvironment', () => {
  it('falls back to the safe export output directory when EXPORT_LOCAL_DIR is blank', () => {
    withEnv('EXPORT_LOCAL_DIR', '   ', () => {
      expect(exportStorageFromEnvironment().directory).toBe(
        resolve(process.cwd(), '../../output/exports'),
      );
    });
  });
});

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
