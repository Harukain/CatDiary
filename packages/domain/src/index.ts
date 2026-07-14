export const MAX_PETS_PER_FAMILY = 5;
export const DEFAULT_TIMEZONE = 'Asia/Shanghai';
export const TASK_GENERATION_WINDOW_DAYS = 7;

export interface RedisConnectionOptions {
  host: string;
  port: number;
  username?: string;
  password?: string;
  db?: number;
  tls?: Record<string, never>;
}

/** Converts a redis:// or rediss:// URL into options shared by BullMQ producers and workers. */
export function redisConnectionFromUrl(value: string): RedisConnectionOptions {
  const url = new URL(value);
  if (url.protocol !== 'redis:' && url.protocol !== 'rediss:')
    throw new Error('Redis URL must use redis:// or rediss://');
  const databaseText = url.pathname.replace(/^\//, '');
  if (databaseText && !/^\d+$/.test(databaseText))
    throw new Error('Redis URL database must be a non-negative integer');
  const database = databaseText ? Number(databaseText) : undefined;
  if (database !== undefined && !Number.isSafeInteger(database))
    throw new Error('Redis URL database is outside the supported range');
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    username: url.username ? decodeURIComponent(url.username) : undefined,
    password: url.password ? decodeURIComponent(url.password) : undefined,
    db: database,
    tls: url.protocol === 'rediss:' ? {} : undefined,
  };
}

export type FamilyRole = 'OWNER' | 'ADMIN' | 'MEMBER';
export type TaskStatus = 'PENDING' | 'COMPLETED' | 'SKIPPED' | 'CANCELLED';
export type RecordType =
  | 'FOOD'
  | 'WATER'
  | 'WEIGHT'
  | 'STOOL'
  | 'VOMIT'
  | 'MEDICATION'
  | 'VACCINE'
  | 'DEWORMING'
  | 'LITTER'
  | 'PHOTO'
  | 'HEALTH_NOTE';

export interface ApiErrorPayload {
  code: string;
  message: string;
  requestId: string;
  details?: unknown;
}

export type OfflineFailureDisposition = 'CONFLICT' | 'FAILED' | 'RETRY_LATER';

const offlineConflictCodes = new Set([
  'VERSION_CONFLICT',
  'TASK_ALREADY_COMPLETED',
  'IDEMPOTENCY_KEY_REUSED',
]);
const offlineRetryableCodes = new Set([
  'INTERNAL_ERROR',
  'SERVICE_UNAVAILABLE',
  'RATE_LIMITED',
  'REQUEST_TIMEOUT',
  'TOKEN_EXPIRED',
  'SESSION_EXPIRED',
]);

/** Keeps transient server/auth failures in the queue and exposes only actionable conflicts to the user. */
export function classifyOfflineFailure(code: string): OfflineFailureDisposition {
  if (offlineConflictCodes.has(code)) return 'CONFLICT';
  if (offlineRetryableCodes.has(code)) return 'RETRY_LATER';
  return 'FAILED';
}

export type RecurrenceRule =
  | { frequency: 'once' }
  | { frequency: 'daily'; interval?: number }
  | { frequency: 'weekly'; interval?: number; weekdays: number[] }
  | { frequency: 'monthly' | 'intervalMonths'; interval?: number; dayOfMonth?: number };

interface GenerateOccurrencesInput {
  startAt: Date;
  endAt?: Date | null;
  timezone: string;
  localTime: string;
  rule: RecurrenceRule;
  from: Date;
  to: Date;
}

export function generateOccurrences(input: GenerateOccurrencesInput): Date[] {
  const zone = input.timezone;
  const start = DateTime.fromJSDate(input.startAt, { zone });
  const fromInstant = DateTime.fromJSDate(input.from, { zone });
  const toInstant = DateTime.fromJSDate(input.to, { zone });
  const end = input.endAt ? DateTime.fromJSDate(input.endAt, { zone }).endOf('day') : null;
  const [hour, minute] = parseLocalTime(input.localTime);
  const firstDay = DateTime.max(fromInstant.startOf('day'), start.startOf('day'));
  const lastDay = end ? DateTime.min(toInstant.endOf('day'), end) : toInstant.endOf('day');
  if (!firstDay.isValid || !lastDay.isValid || firstDay > lastDay) return [];
  const occurrences: Date[] = [];
  for (let day = firstDay; day <= lastDay; day = day.plus({ days: 1 })) {
    const candidate = day.set({ hour, minute, second: 0, millisecond: 0 });
    if (candidate < start || candidate < fromInstant || candidate > toInstant) continue;
    if (matchesRecurrence(candidate, start, input.rule))
      occurrences.push(candidate.toUTC().toJSDate());
  }
  return occurrences;
}

export function getLocalDayBounds(timezone: string, instant = new Date()) {
  const local = DateTime.fromJSDate(instant, { zone: timezone });
  if (!local.isValid) throw new Error('Invalid IANA timezone');
  return {
    start: local.startOf('day').toUTC().toJSDate(),
    end: local.endOf('day').toUTC().toJSDate(),
  };
}

export function isValidCalendarDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = DateTime.fromISO(value, { zone: 'UTC' });
  return date.isValid && date.toISODate() === value;
}

export function isCalendarDateOnOrBefore(
  value: string,
  instant = new Date(),
  timezone = DEFAULT_TIMEZONE,
) {
  if (!isValidCalendarDate(value)) return false;
  const local = DateTime.fromJSDate(instant, { zone: timezone });
  return local.isValid && value <= local.toISODate()!;
}

function matchesRecurrence(candidate: DateTime, start: DateTime, rule: RecurrenceRule) {
  if (rule.frequency === 'once') return candidate.hasSame(start, 'day');
  const interval = Math.max(1, rule.interval ?? 1);
  if (rule.frequency === 'daily')
    return (
      Math.floor(candidate.startOf('day').diff(start.startOf('day'), 'days').days) % interval === 0
    );
  if (rule.frequency === 'weekly') {
    const weeks = Math.floor(candidate.startOf('week').diff(start.startOf('week'), 'weeks').weeks);
    return weeks >= 0 && weeks % interval === 0 && rule.weekdays.includes(candidate.weekday);
  }
  const months = (candidate.year - start.year) * 12 + candidate.month - start.month;
  return months >= 0 && months % interval === 0 && candidate.day === (rule.dayOfMonth ?? start.day);
}

function parseLocalTime(value: string): [number, number] {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) throw new Error('localTime must use HH:mm');
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) throw new Error('localTime is outside valid range');
  return [hour, minute];
}
import { DateTime } from 'luxon';
