export const RECORD_CACHE_RETENTION_MS = 90 * 86_400_000;
export const TASK_CACHE_RETENTION_MS = 7 * 86_400_000;
export const ORPHAN_PHOTO_RETENTION_MS = 24 * 60 * 60 * 1000;

export function isPastRetention(
  timestampMs: number | null | undefined,
  retentionMs: number,
  now = Date.now(),
) {
  return typeof timestampMs === 'number' && timestampMs < now - retentionMs;
}
