import { createHash } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import type { PrismaClient } from '@prisma/client';
import COS from 'cos-nodejs-sdk-v5';

interface ExportStorage {
  directory: string;
  cos?: { client: COS; bucket: string; region: string };
}
export function exportStorageFromEnvironment(): ExportStorage {
  const bucket = process.env.COS_BUCKET;
  const region = process.env.COS_REGION;
  const secretId = process.env.COS_SECRET_ID;
  const secretKey = process.env.COS_SECRET_KEY;
  return {
    directory: resolve(process.cwd(), process.env.EXPORT_LOCAL_DIR ?? '../../output/exports'),
    ...(bucket && region && secretId && secretKey
      ? { cos: { client: new COS({ SecretId: secretId, SecretKey: secretKey }), bucket, region } }
      : {}),
  };
}

export async function buildExport(
  prisma: PrismaClient,
  exportId: string,
  storage: ExportStorage,
  now = new Date(),
) {
  const reserved = await prisma.exportJob.updateMany({
    where: { id: exportId, status: { in: ['QUEUED', 'FAILED'] } },
    data: { status: 'PROCESSING', errorCode: null },
  });
  if (!reserved.count) return { skipped: true };
  const job = await prisma.exportJob.findUniqueOrThrow({ where: { id: exportId } });
  try {
    const payload =
      job.scope === 'FAMILY'
        ? await familyExport(prisma, job.familyId, now)
        : await personalExport(prisma, job.familyId, job.requestedById, now);
    const body = Buffer.from(
      job.format === 'JSON' ? JSON.stringify(payload, null, 2) : toCsv(payload),
      'utf8',
    );
    const extension = job.format.toLowerCase();
    const objectKey = `exports/${job.familyId}/${job.id}.${extension}`;
    const mimeType =
      job.format === 'JSON' ? 'application/json; charset=utf-8' : 'text/csv; charset=utf-8';
    if (storage.cos)
      await storage.cos.client.putObject({
        Bucket: storage.cos.bucket,
        Region: storage.cos.region,
        Key: objectKey,
        Body: body,
        ContentType: mimeType,
      });
    else {
      const path = resolve(storage.directory, objectKey.replace(/^exports\//, ''));
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, body);
    }
    const completedAt = new Date();
    const expiresAt = new Date(completedAt.getTime() + 7 * 24 * 60 * 60 * 1000);
    await prisma.exportJob.update({
      where: { id: job.id },
      data: {
        status: 'READY',
        objectKey,
        mimeType,
        byteSize: body.length,
        checksum: createHash('sha256').update(body).digest('hex'),
        completedAt,
        expiresAt,
      },
    });
    return { exportId: job.id, byteSize: body.length, format: job.format, scope: job.scope };
  } catch (error) {
    await prisma.exportJob.update({
      where: { id: job.id },
      data: { status: 'FAILED', errorCode: 'EXPORT_BUILD_FAILED' },
    });
    throw error;
  }
}

export async function cleanupExpiredExports(
  prisma: PrismaClient,
  storage: ExportStorage,
  now = new Date(),
) {
  const jobs = await prisma.exportJob.findMany({
    where: { status: 'READY', expiresAt: { lte: now }, objectKey: { not: null } },
    select: { id: true, objectKey: true },
  });
  for (const job of jobs)
    if (job.objectKey) {
      if (storage.cos)
        await storage.cos.client.deleteObject({
          Bucket: storage.cos.bucket,
          Region: storage.cos.region,
          Key: job.objectKey,
        });
      else
        await unlink(resolve(storage.directory, job.objectKey.replace(/^exports\//, ''))).catch(
          (error: NodeJS.ErrnoException) => {
            if (error.code !== 'ENOENT') throw error;
          },
        );
    }
  if (jobs.length)
    await prisma.exportJob.updateMany({
      where: { id: { in: jobs.map((job) => job.id) } },
      data: {
        status: 'EXPIRED',
        objectKey: null,
        downloadTokenHash: null,
        downloadTokenExpiresAt: null,
      },
    });
  return { expiredExports: jobs.length };
}

async function familyExport(prisma: PrismaClient, familyId: string, generatedAt: Date) {
  const [family, members, pets, plans, tasks, records, healthEvents, medicalRecords, photos] =
    await Promise.all([
      prisma.family.findUniqueOrThrow({
        where: { id: familyId },
        select: { id: true, name: true, timezone: true, createdAt: true, updatedAt: true },
      }),
      prisma.membership.findMany({
        where: { familyId },
        select: {
          id: true,
          role: true,
          status: true,
          createdAt: true,
          user: { select: { id: true, displayName: true } },
        },
      }),
      prisma.pet.findMany({
        where: { familyId },
        select: {
          id: true,
          name: true,
          sex: true,
          birthDate: true,
          breed: true,
          neutered: true,
          chipNumber: true,
          createdAt: true,
          updatedAt: true,
          deletedAt: true,
        },
      }),
      prisma.plan.findMany({ where: { familyId } }),
      prisma.task.findMany({ where: { familyId } }),
      prisma.record.findMany({ where: { familyId } }),
      prisma.healthEvent.findMany({ where: { familyId }, include: { records: true } }),
      prisma.medicalRecord.findMany({ where: { familyId } }),
      prisma.photo.findMany({
        where: { familyId },
        select: {
          id: true,
          createdById: true,
          mimeType: true,
          byteSize: true,
          checksum: true,
          width: true,
          height: true,
          note: true,
          status: true,
          createdAt: true,
          deletedAt: true,
          pets: { select: { petId: true } },
          records: { select: { recordId: true } },
        },
      }),
    ]);
  return {
    schemaVersion: 1,
    generatedAt,
    scope: 'FAMILY',
    family,
    members,
    pets,
    plans,
    tasks,
    records,
    healthEvents,
    medicalRecords,
    photos,
  };
}
async function personalExport(
  prisma: PrismaClient,
  familyId: string,
  userId: string,
  generatedAt: Date,
) {
  const [user, membership, records, photos, preferences] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { id: true, displayName: true, status: true, createdAt: true, updatedAt: true },
    }),
    prisma.membership.findFirst({
      where: { familyId, userId },
      select: {
        role: true,
        status: true,
        createdAt: true,
        family: { select: { id: true, name: true, timezone: true } },
      },
    }),
    prisma.record.findMany({ where: { familyId, authorId: userId } }),
    prisma.photo.findMany({
      where: { familyId, createdById: userId },
      select: {
        id: true,
        note: true,
        mimeType: true,
        byteSize: true,
        checksum: true,
        createdAt: true,
        deletedAt: true,
        pets: { select: { petId: true } },
      },
    }),
    prisma.notificationPreference.findUnique({
      where: { familyId_userId: { familyId, userId } },
      select: {
        taskReminderEnabled: true,
        pushEnabled: true,
        overdueEnabled: true,
        updatedAt: true,
      },
    }),
  ]);
  return {
    schemaVersion: 1,
    generatedAt,
    scope: 'PERSONAL',
    user,
    membership,
    authoredRecords: records,
    uploadedPhotos: photos,
    notificationPreferences: preferences,
  };
}
function toCsv(payload: Record<string, unknown>) {
  const rows: Array<[string, string, string]> = [];
  for (const [entityType, value] of Object.entries(payload)) {
    const values = Array.isArray(value) ? value : [value];
    values.forEach((item, index) =>
      rows.push([
        entityType,
        typeof item === 'object' && item && 'id' in item
          ? String((item as { id: unknown }).id)
          : String(index + 1),
        JSON.stringify(item),
      ]),
    );
  }
  return ['entity_type,id,data_json', ...rows.map((row) => row.map(csvCell).join(','))].join(
    '\r\n',
  );
}
function csvCell(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}
