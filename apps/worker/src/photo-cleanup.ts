import { unlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { PrismaClient } from '@prisma/client';
import COS from 'cos-nodejs-sdk-v5';

interface StorageConfig {
  localDirectory: string;
  cos?: { client: COS; bucket: string; region: string };
}

export function photoStorageConfigFromEnvironment(): StorageConfig {
  const bucket = process.env.COS_BUCKET;
  const region = process.env.COS_REGION;
  const secretId = process.env.COS_SECRET_ID;
  const secretKey = process.env.COS_SECRET_KEY;
  return {
    localDirectory: resolve(process.cwd(), process.env.UPLOAD_LOCAL_DIR ?? '../../output/uploads'),
    ...(bucket && region && secretId && secretKey
      ? { cos: { client: new COS({ SecretId: secretId, SecretKey: secretKey }), bucket, region } }
      : {}),
  };
}

export async function cleanupPhotoObjects(
  prisma: PrismaClient,
  storage: StorageConfig,
  now = new Date(),
) {
  const orphanBefore = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const deletedBefore = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const [orphanIntents, deletedPhotos, expiredFamilies] = await Promise.all([
    prisma.uploadIntent.findMany({
      where: { completedAt: null, expiresAt: { lt: orphanBefore } },
      select: { id: true, objectKey: true },
    }),
    prisma.photo.findMany({
      where: { status: 'DELETED', deletedAt: { lt: deletedBefore } },
      select: { id: true, objectKey: true, thumbnailObjectKey: true },
    }),
    prisma.family.findMany({
      where: { deletedAt: { lt: deletedBefore } },
      select: { id: true, photos: { select: { objectKey: true, thumbnailObjectKey: true } } },
    }),
  ]);
  const keys = [
    ...orphanIntents.map((item) => item.objectKey),
    ...deletedPhotos.flatMap((photo) =>
      [photo.objectKey, photo.thumbnailObjectKey].filter((key): key is string => !!key),
    ),
    ...expiredFamilies.flatMap((family) =>
      family.photos.flatMap((photo) =>
        [photo.objectKey, photo.thumbnailObjectKey].filter((key): key is string => !!key),
      ),
    ),
  ];
  for (const key of [...new Set(keys)]) await deleteObject(storage, key);
  await prisma.$transaction(async (tx) => {
    if (deletedPhotos.length)
      await tx.photo.deleteMany({ where: { id: { in: deletedPhotos.map((photo) => photo.id) } } });
    if (orphanIntents.length)
      await tx.uploadIntent.deleteMany({
        where: { id: { in: orphanIntents.map((intent) => intent.id) } },
      });
    if (expiredFamilies.length)
      await tx.family.deleteMany({
        where: { id: { in: expiredFamilies.map((family) => family.id) } },
      });
    await tx.uploadIntent.deleteMany({
      where: { completedAt: { lt: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) } },
    });
  });
  return {
    orphanIntents: orphanIntents.length,
    deletedPhotos: deletedPhotos.length,
    familiesDeleted: expiredFamilies.length,
    objectsProcessed: new Set(keys).size,
  };
}

async function deleteObject(storage: StorageConfig, objectKey: string) {
  if (storage.cos) {
    await storage.cos.client.deleteObject({
      Bucket: storage.cos.bucket,
      Region: storage.cos.region,
      Key: objectKey,
    });
    return;
  }
  await unlink(join(storage.localDirectory, ...objectKey.split('/'))).catch(
    (error: NodeJS.ErrnoException) => {
      if (error.code !== 'ENOENT') throw error;
    },
  );
}
