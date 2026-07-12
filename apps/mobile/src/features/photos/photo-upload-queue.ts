import * as SQLite from 'expo-sqlite';
import * as FileSystem from 'expo-file-system/legacy';
import { authApi } from '../auth/auth-api';
import { isPastRetention, ORPHAN_PHOTO_RETENTION_MS } from '../local-data/retention';

export interface PhotoUploadQueueItem {
  id: string;
  familyId: string;
  fileUri: string;
  thumbnailUri: string;
  fileName: string;
  width: number;
  height: number;
  petIds: string[];
  note: string;
  status: 'PENDING' | 'FAILED';
  attempt: number;
  lastError: string | null;
  createdAt: number;
}

let queueDatabasePromise: Promise<SQLite.SQLiteDatabase> | null = null;
async function queueDatabase() {
  if (!queueDatabasePromise)
    queueDatabasePromise = SQLite.openDatabaseAsync('cat-diary.db').then(async (db) => {
      await db.execAsync(
        `CREATE TABLE IF NOT EXISTS photo_upload_queue (id TEXT PRIMARY KEY NOT NULL, family_id TEXT NOT NULL, file_uri TEXT NOT NULL, thumbnail_uri TEXT NOT NULL, file_name TEXT NOT NULL, width INTEGER NOT NULL, height INTEGER NOT NULL, pet_ids_json TEXT NOT NULL, note TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'PENDING', attempt INTEGER NOT NULL DEFAULT 0, last_error TEXT, created_at INTEGER NOT NULL); CREATE INDEX IF NOT EXISTS photo_upload_queue_family_created_idx ON photo_upload_queue(family_id, created_at);`,
      );
      return db;
    });
  return queueDatabasePromise;
}

export async function enqueuePhotoUpload(input: {
  familyId: string;
  fileUri: string;
  thumbnailUri: string;
  fileName: string;
  width: number;
  height: number;
  petIds: string[];
  note: string;
}) {
  if (!FileSystem.documentDirectory) throw new Error('设备文件目录不可用');
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const directory = `${FileSystem.documentDirectory}photo-upload-queue/`;
  await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
  const fileUri = `${directory}${id}-original.jpg`;
  const thumbnailUri = `${directory}${id}-thumbnail.jpg`;
  await FileSystem.copyAsync({ from: input.fileUri, to: fileUri });
  try {
    await FileSystem.copyAsync({ from: input.thumbnailUri, to: thumbnailUri });
  } catch (error) {
    await FileSystem.deleteAsync(fileUri, { idempotent: true });
    throw error;
  }
  const createdAt = Date.now();
  const db = await queueDatabase();
  await db.runAsync(
    `INSERT INTO photo_upload_queue (id, family_id, file_uri, thumbnail_uri, file_name, width, height, pet_ids_json, note, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?)`,
    id,
    input.familyId,
    fileUri,
    thumbnailUri,
    input.fileName,
    input.width,
    input.height,
    JSON.stringify(input.petIds),
    input.note,
    createdAt,
  );
  return {
    id,
    familyId: input.familyId,
    fileUri,
    thumbnailUri,
    fileName: input.fileName,
    width: input.width,
    height: input.height,
    petIds: input.petIds,
    note: input.note,
    status: 'PENDING' as const,
    attempt: 0,
    lastError: null,
    createdAt,
  };
}

export async function listPhotoUploads(familyId: string) {
  const db = await queueDatabase();
  const rows = await db.getAllAsync<{
    id: string;
    family_id: string;
    file_uri: string;
    thumbnail_uri: string;
    file_name: string;
    width: number;
    height: number;
    pet_ids_json: string;
    note: string;
    status: 'PENDING' | 'FAILED';
    attempt: number;
    last_error: string | null;
    created_at: number;
  }>('SELECT * FROM photo_upload_queue WHERE family_id = ? ORDER BY created_at ASC', familyId);
  return rows.map((row): PhotoUploadQueueItem => ({
    id: row.id,
    familyId: row.family_id,
    fileUri: row.file_uri,
    thumbnailUri: row.thumbnail_uri,
    fileName: row.file_name,
    width: row.width,
    height: row.height,
    petIds: JSON.parse(row.pet_ids_json) as string[],
    note: row.note,
    status: row.status,
    attempt: row.attempt,
    lastError: row.last_error,
    createdAt: row.created_at,
  }));
}

export async function processPhotoUpload(
  accessToken: string,
  item: PhotoUploadQueueItem,
  onProgress?: (progress: number) => void,
) {
  const db = await queueDatabase();
  try {
    await db.runAsync(
      "UPDATE photo_upload_queue SET status = 'PENDING', last_error = NULL WHERE id = ?",
      item.id,
    );
    onProgress?.(10);
    const originalBlob = await (await fetch(item.fileUri)).blob();
    const thumbnailBlob = await (await fetch(item.thumbnailUri)).blob();
    const originalPresign = await authApi.presignPhoto(accessToken, item.familyId, {
      fileName: item.fileName,
      mimeType: 'image/jpeg',
      byteSize: originalBlob.size,
      purpose: 'PHOTO',
    });
    const thumbnailPresign = await authApi.presignPhoto(accessToken, item.familyId, {
      fileName: `thumb-${item.fileName}`,
      mimeType: 'image/jpeg',
      byteSize: thumbnailBlob.size,
      purpose: 'PHOTO_THUMBNAIL',
    });
    onProgress?.(35);
    const checksum = await authApi.uploadPhotoBinary(originalPresign, originalBlob);
    onProgress?.(60);
    const thumbnailChecksum = await authApi.uploadPhotoBinary(thumbnailPresign, thumbnailBlob);
    onProgress?.(82);
    const photo = await authApi.createPhoto(accessToken, item.familyId, {
      objectKey: originalPresign.objectKey,
      thumbnailObjectKey: thumbnailPresign.objectKey,
      petIds: item.petIds,
      note: item.note || undefined,
      checksum,
      thumbnailChecksum,
      width: item.width,
      height: item.height,
    });
    await db.runAsync('DELETE FROM photo_upload_queue WHERE id = ?', item.id);
    await Promise.all([
      FileSystem.deleteAsync(item.fileUri, { idempotent: true }),
      FileSystem.deleteAsync(item.thumbnailUri, { idempotent: true }),
    ]);
    onProgress?.(100);
    return photo;
  } catch (error) {
    const message = error instanceof Error ? error.message : '上传失败';
    await db.runAsync(
      "UPDATE photo_upload_queue SET status = 'FAILED', attempt = attempt + 1, last_error = ? WHERE id = ?",
      message.slice(0, 300),
      item.id,
    );
    throw error;
  }
}

export async function discardPhotoUpload(item: PhotoUploadQueueItem) {
  const db = await queueDatabase();
  await db.runAsync('DELETE FROM photo_upload_queue WHERE id = ?', item.id);
  await Promise.all([
    FileSystem.deleteAsync(item.fileUri, { idempotent: true }),
    FileSystem.deleteAsync(item.thumbnailUri, { idempotent: true }),
  ]);
}

export async function clearPhotoUploadLocalData() {
  const db = await queueDatabase();
  const rows = await db.getAllAsync<{ file_uri: string; thumbnail_uri: string }>(
    'SELECT file_uri, thumbnail_uri FROM photo_upload_queue',
  );
  await db.runAsync('DELETE FROM photo_upload_queue');
  await Promise.all(
    rows
      .flatMap((row) => [row.file_uri, row.thumbnail_uri])
      .map(async (uri) => {
        try {
          await FileSystem.deleteAsync(uri, { idempotent: true });
        } catch {
          // The database is already cleared; a later orphan cleanup may remove an inaccessible file.
        }
      }),
  );
}

export async function cleanupOrphanedPhotoFiles(now = Date.now()) {
  if (!FileSystem.documentDirectory) return;
  const directory = `${FileSystem.documentDirectory}photo-upload-queue/`;
  const directoryInfo = await FileSystem.getInfoAsync(directory);
  if (!directoryInfo.exists) return;
  const db = await queueDatabase();
  const rows = await db.getAllAsync<{ file_uri: string; thumbnail_uri: string }>(
    'SELECT file_uri, thumbnail_uri FROM photo_upload_queue',
  );
  const referenced = new Set(rows.flatMap((row) => [row.file_uri, row.thumbnail_uri]));
  const names = await FileSystem.readDirectoryAsync(directory);
  await Promise.all(
    names.map(async (name) => {
      const uri = `${directory}${name}`;
      if (referenced.has(uri)) return;
      const info = await FileSystem.getInfoAsync(uri);
      const modificationTimeMs =
        info.exists && typeof info.modificationTime === 'number'
          ? info.modificationTime * 1000
          : undefined;
      if (isPastRetention(modificationTimeMs, ORPHAN_PHOTO_RETENTION_MS, now))
        await FileSystem.deleteAsync(uri, { idempotent: true });
    }),
  );
}
