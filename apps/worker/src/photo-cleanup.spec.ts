import { mkdtemp, mkdir, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import type { PrismaClient } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { cleanupPhotoObjects, photoStorageConfigFromEnvironment } from './photo-cleanup.js';

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

describe('photoStorageConfigFromEnvironment', () => {
  it('falls back to the safe upload output directory when UPLOAD_LOCAL_DIR is blank', () => {
    withEnv('UPLOAD_LOCAL_DIR', '', () => {
      expect(photoStorageConfigFromEnvironment().localDirectory).toBe(
        resolve(process.cwd(), '../../output/uploads'),
      );
    });
  });
});

describe('cleanupPhotoObjects', () => {
  it('removes expired orphan objects, deleted photo files, and their database rows', async () => {
    const root = await mkdtemp(join(tmpdir(), 'cat-diary-photo-cleanup-'));
    const keys = [
      'families/f1/photos/orphan.jpg',
      'families/f1/photos/deleted.jpg',
      'families/f1/thumbnails/deleted.jpg',
    ];
    for (const key of keys) {
      const path = join(root, key);
      await mkdir(join(path, '..'), { recursive: true });
      await writeFile(path, 'image');
    }
    const calls = { photoIds: [] as string[], intentIds: [] as string[] };
    const tx = {
      photo: {
        deleteMany: async ({ where }: { where: { id: { in: string[] } } }) => {
          calls.photoIds = where.id.in;
        },
      },
      uploadIntent: {
        deleteMany: async ({ where }: { where: { id?: { in: string[] } } }) => {
          if (where.id) calls.intentIds = where.id.in;
        },
      },
      family: { deleteMany: async () => ({ count: 0 }) },
    };
    const prisma = {
      uploadIntent: { findMany: async () => [{ id: 'intent-1', objectKey: keys[0] }] },
      photo: {
        findMany: async () => [{ id: 'photo-1', objectKey: keys[1], thumbnailObjectKey: keys[2] }],
      },
      family: { findMany: async () => [] },
      $transaction: async (callback: (client: typeof tx) => Promise<void>) => callback(tx),
    } as unknown as PrismaClient;
    const result = await cleanupPhotoObjects(
      prisma,
      { localDirectory: root },
      new Date('2026-07-12T00:00:00Z'),
    );
    expect(result).toEqual({
      orphanIntents: 1,
      deletedPhotos: 1,
      familiesDeleted: 0,
      objectsProcessed: 3,
    });
    expect(calls).toEqual({ photoIds: ['photo-1'], intentIds: ['intent-1'] });
    for (const key of keys)
      await expect(stat(join(root, key))).rejects.toMatchObject({ code: 'ENOENT' });
  });
});
