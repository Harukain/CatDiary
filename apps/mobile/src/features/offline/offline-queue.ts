import * as SQLite from 'expo-sqlite';
import { classifyOfflineFailure } from '@cat-diary/domain';
import {
  AuthApiError,
  type OfflineOperation,
  type RecordSummary,
  type TaskSummary,
} from '../auth/auth-api';
import { RECORD_CACHE_RETENTION_MS, TASK_CACHE_RETENTION_MS } from '../local-data/retention';

let databasePromise: Promise<SQLite.SQLiteDatabase> | null = null;

async function database() {
  if (!databasePromise) {
    databasePromise = SQLite.openDatabaseAsync('cat-diary.db').then(async (db) => {
      await db.execAsync(`
        PRAGMA journal_mode = WAL;
        CREATE TABLE IF NOT EXISTS offline_operations (
          id TEXT PRIMARY KEY NOT NULL,
          family_id TEXT NOT NULL,
          path TEXT NOT NULL,
          body_json TEXT NOT NULL,
          idempotency_key TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'PENDING',
          attempt INTEGER NOT NULL DEFAULT 0,
          last_error TEXT,
          created_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS offline_operations_status_created_idx
          ON offline_operations(status, created_at);
        CREATE TABLE IF NOT EXISTS record_cache (
          id TEXT PRIMARY KEY NOT NULL,
          family_id TEXT NOT NULL,
          pet_id TEXT,
          occurred_at TEXT NOT NULL,
          record_json TEXT NOT NULL,
          cached_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS record_cache_family_time_idx
          ON record_cache(family_id, occurred_at DESC);
        CREATE TABLE IF NOT EXISTS task_cache (
          id TEXT PRIMARY KEY NOT NULL,
          family_id TEXT NOT NULL,
          scope TEXT NOT NULL,
          task_json TEXT NOT NULL,
          cached_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS task_cache_family_scope_idx
          ON task_cache(family_id, scope, cached_at DESC);
      `);
      return db;
    });
  }
  return databasePromise;
}

export async function pruneExpiredRecordCache(now = Date.now()) {
  const db = await database();
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      'DELETE FROM record_cache WHERE cached_at < ?',
      now - RECORD_CACHE_RETENTION_MS,
    );
    await db.runAsync('DELETE FROM task_cache WHERE cached_at < ?', now - TASK_CACHE_RETENTION_MS);
  });
}

export async function clearOfflineLocalData() {
  const db = await database();
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM offline_operations');
    await db.runAsync('DELETE FROM record_cache');
    await db.runAsync('DELETE FROM task_cache');
  });
}

export async function cacheTasks(
  familyId: string,
  scope: 'today' | 'upcoming' | 'overdue' | 'completed',
  tasks: TaskSummary[],
) {
  const db = await database();
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM task_cache WHERE family_id = ? AND scope = ?', familyId, scope);
    for (const task of tasks)
      await db.runAsync(
        'INSERT OR REPLACE INTO task_cache (id, family_id, scope, task_json, cached_at) VALUES (?, ?, ?, ?, ?)',
        task.id,
        familyId,
        scope,
        JSON.stringify(task),
        Date.now(),
      );
  });
}

export async function getCachedTasks(
  familyId: string,
  scope: 'today' | 'upcoming' | 'overdue' | 'completed',
) {
  const db = await database();
  const rows = await db.getAllAsync<{ task_json: string }>(
    'SELECT task_json FROM task_cache WHERE family_id = ? AND scope = ? ORDER BY cached_at DESC LIMIT 100',
    familyId,
    scope,
  );
  return rows.map((row) => JSON.parse(row.task_json) as TaskSummary);
}

export async function removeCachedTask(taskId: string) {
  const db = await database();
  await db.runAsync('DELETE FROM task_cache WHERE id = ?', taskId);
}

export async function enqueueOfflineOperation(operation: OfflineOperation) {
  const db = await database();
  await insertOfflineOperation(db, operation);
}

export async function enqueueOfflineRecordOperation(
  operation: OfflineOperation,
  record: RecordSummary,
) {
  const db = await database();
  await db.withTransactionAsync(async () => {
    await insertOfflineOperation(db, operation);
    await upsertRecordCache(db, operation.familyId, record);
  });
}

async function insertOfflineOperation(db: SQLite.SQLiteDatabase, operation: OfflineOperation) {
  await db.runAsync(
    `INSERT OR IGNORE INTO offline_operations
      (id, family_id, path, body_json, idempotency_key, status, created_at)
      VALUES (?, ?, ?, ?, ?, 'PENDING', ?)`,
    operation.id,
    operation.familyId,
    operation.path,
    JSON.stringify(operation.body),
    operation.idempotencyKey,
    Date.now(),
  );
}

export async function flushOfflineOperations(
  accessToken: string,
  send: (accessToken: string, operation: OfflineOperation) => Promise<unknown>,
) {
  const db = await database();
  const rows = await db.getAllAsync<{
    id: string;
    family_id: string;
    path: string;
    body_json: string;
    idempotency_key: string;
    attempt: number;
  }>("SELECT * FROM offline_operations WHERE status = 'PENDING' ORDER BY created_at ASC LIMIT 50");
  let synced = 0;
  let conflicts = 0;
  for (const row of rows) {
    const operation: OfflineOperation = {
      id: row.id,
      familyId: row.family_id,
      path: row.path,
      body: JSON.parse(row.body_json) as Record<string, unknown>,
      idempotencyKey: row.idempotency_key,
    };
    try {
      await send(accessToken, operation);
      await db.withTransactionAsync(async () => {
        await db.runAsync('DELETE FROM offline_operations WHERE id = ?', row.id);
        await db.runAsync('DELETE FROM record_cache WHERE id = ?', row.id);
      });
      synced += 1;
    } catch (error) {
      if (!(error instanceof AuthApiError)) break;
      const disposition = classifyOfflineFailure(error.code);
      if (disposition === 'RETRY_LATER') {
        await db.runAsync(
          'UPDATE offline_operations SET attempt = attempt + 1, last_error = ? WHERE id = ?',
          error.code,
          row.id,
        );
        break;
      }
      await db.runAsync(
        'UPDATE offline_operations SET status = ?, attempt = attempt + 1, last_error = ? WHERE id = ?',
        disposition,
        error.code,
        row.id,
      );
      if (disposition === 'CONFLICT') conflicts += 1;
    }
  }
  return { attempted: rows.length, synced, conflicts };
}

export async function cacheRecords(familyId: string, records: RecordSummary[]) {
  const db = await database();
  await db.withTransactionAsync(async () => {
    for (const record of records) {
      await upsertRecordCache(db, familyId, record);
    }
    await db.runAsync(
      `DELETE FROM record_cache WHERE family_id = ? AND occurred_at < ?`,
      familyId,
      new Date(Date.now() - 90 * 86_400_000).toISOString(),
    );
  });
}

async function upsertRecordCache(
  db: SQLite.SQLiteDatabase,
  familyId: string,
  record: RecordSummary,
) {
  await db.runAsync(
    `INSERT OR REPLACE INTO record_cache (id, family_id, pet_id, occurred_at, record_json, cached_at) VALUES (?, ?, ?, ?, ?, ?)`,
    record.id,
    familyId,
    record.petId,
    record.occurredAt,
    JSON.stringify(record),
    Date.now(),
  );
}

export async function getCachedRecords(familyId: string, petId?: string) {
  const db = await database();
  const rows = await db.getAllAsync<{ record_json: string }>(
    `SELECT record_json FROM record_cache WHERE family_id = ? ${petId ? 'AND pet_id = ?' : ''} ORDER BY occurred_at DESC LIMIT 100`,
    ...(petId ? [familyId, petId] : [familyId]),
  );
  return rows.map((row) => JSON.parse(row.record_json) as RecordSummary);
}

export async function getOfflineOperationCount() {
  const db = await database();
  const row = await db.getFirstAsync<{ count: number }>(
    "SELECT COUNT(*) AS count FROM offline_operations WHERE status = 'PENDING'",
  );
  return row?.count ?? 0;
}

export interface OfflineConflict {
  id: string;
  familyId: string;
  path: string;
  body: Record<string, unknown>;
  idempotencyKey: string;
  status: 'CONFLICT' | 'FAILED';
  attempt: number;
  lastError: string | null;
  createdAt: number;
}

export async function getOfflineConflicts(familyId: string) {
  const db = await database();
  const rows = await db.getAllAsync<{
    id: string;
    family_id: string;
    path: string;
    body_json: string;
    idempotency_key: string;
    status: 'CONFLICT' | 'FAILED';
    attempt: number;
    last_error: string | null;
    created_at: number;
  }>(
    "SELECT * FROM offline_operations WHERE family_id = ? AND status IN ('CONFLICT', 'FAILED') ORDER BY created_at ASC",
    familyId,
  );
  return rows.map((row): OfflineConflict => ({
    id: row.id,
    familyId: row.family_id,
    path: row.path,
    body: JSON.parse(row.body_json) as Record<string, unknown>,
    idempotencyKey: row.idempotency_key,
    status: row.status,
    attempt: row.attempt,
    lastError: row.last_error,
    createdAt: row.created_at,
  }));
}

export async function discardOfflineOperation(id: string) {
  const db = await database();
  await db.runAsync('DELETE FROM offline_operations WHERE id = ?', id);
}

export async function retryOfflineOperation(id: string, body: Record<string, unknown>) {
  const db = await database();
  await db.runAsync(
    "UPDATE offline_operations SET body_json = ?, status = 'PENDING', last_error = NULL WHERE id = ?",
    JSON.stringify(body),
    id,
  );
}

export function isNetworkFailure(error: unknown) {
  return (
    error instanceof TypeError ||
    (error instanceof Error && /network|fetch|offline/i.test(error.message))
  );
}
