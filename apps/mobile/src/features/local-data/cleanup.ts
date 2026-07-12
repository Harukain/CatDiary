import { clearOfflineLocalData, pruneExpiredRecordCache } from '../offline/offline-queue';
import { cleanupOrphanedPhotoFiles, clearPhotoUploadLocalData } from '../photos/photo-upload-queue';

export async function clearSensitiveLocalData() {
  await Promise.all([clearOfflineLocalData(), clearPhotoUploadLocalData()]);
}

export async function maintainSensitiveLocalData() {
  await Promise.all([pruneExpiredRecordCache(), cleanupOrphanedPhotoFiles()]);
}
