import { Platform } from 'react-native';
import { clearAuthSession, getRefreshToken, saveAuthSession } from './session-store';
import { isTerminalSessionError } from './session-policy';
import { runtimeConfig } from '../../shared/config/runtime-config';

const baseUrl = runtimeConfig.apiUrl;
export function apiResourceUrl(path: string) {
  return path.startsWith('http://') || path.startsWith('https://') ? path : `${baseUrl}${path}`;
}

interface ApiEnvelope<T> {
  data: T;
  meta: { requestId: string };
}
interface ApiErrorEnvelope {
  error: {
    code: string;
    message: string;
    fieldErrors?: Array<{ field: string; code: string }>;
    details?: Record<string, unknown>;
  };
}

export class AuthApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const payload = (await response.json()) as ApiEnvelope<T> | ApiErrorEnvelope;
  if (!response.ok || 'error' in payload) {
    const error =
      'error' in payload ? payload.error : { code: 'NETWORK_ERROR', message: '网络请求失败' };
    throw new AuthApiError(error.code, error.message, error.details);
  }
  return payload.data;
}

export interface AuthSession {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: { id: string; displayName: string | null };
  families: Array<{ id: string; name: string; timezone: string; role: string }>;
}

export interface FamilySummary {
  id: string;
  name: string;
  timezone: string;
  role: string;
  version?: number;
}
export interface PetSummary {
  id: string;
  familyId: string;
  name: string;
  version: number;
  avatarUrl?: string | null;
}
export interface MemberSummary {
  id: string;
  role: 'OWNER' | 'ADMIN' | 'MEMBER';
  status: string;
  user: { id: string; displayName: string | null };
}
export type PlanType =
  | 'VACCINE'
  | 'DEWORMING'
  | 'MEDICATION'
  | 'LITTER'
  | 'FOOD'
  | 'WATER'
  | 'WEIGHT'
  | 'STOOL'
  | 'VOMIT'
  | 'PHOTO'
  | 'HEALTH_NOTE';
export interface PlanSummary {
  id: string;
  petId: string | null;
  assigneeId?: string | null;
  title: string;
  detail?: string | null;
  recordType: PlanType;
  startAt?: string;
  localTime: string;
  recurrenceRule?: {
    frequency: 'once' | 'daily' | 'weekly' | 'monthly' | 'intervalMonths';
    interval?: number;
    weekdays?: number[];
    dayOfMonth?: number;
  };
  enabled: boolean;
  version: number;
  generatedTaskCount?: number;
}
export interface TaskSummary {
  id: string;
  planId: string | null;
  petId: string | null;
  title: string;
  detail?: string | null;
  type: PlanType;
  status: 'PENDING' | 'COMPLETED' | 'SKIPPED' | 'CANCELLED';
  scheduledAt: string;
  completedAt?: string | null;
  result?: Record<string, unknown> | null;
  note?: string | null;
  version: number;
  pet?: { id: string; name: string } | null;
  assignee?: { id: string; displayName: string | null } | null;
}
export interface CompleteTaskInput {
  actualAt: string;
  result: Record<string, unknown>;
  note?: string;
  medicalConfirmed?: boolean;
}
export type TaskMutationResult =
  | TaskSummary
  | {
      task: TaskSummary;
      record: unknown;
    };
export type NotificationStatus = 'QUEUED' | 'SENT' | 'DELIVERED' | 'FAILED' | 'SKIPPED';
export interface NotificationLogSummary {
  id: string;
  channel: 'DEVELOPMENT' | 'EXPO_PUSH' | 'FEISHU';
  status: NotificationStatus;
  attempt: number;
  scheduledAt: string;
  sentAt?: string | null;
  errorCode?: string | null;
  errorMessageSafe?: string | null;
  task?: { id: string; title: string; scheduledAt: string } | null;
}
export interface NotificationChannelSummary {
  id: string;
  type: 'DEVELOPMENT' | 'EXPO_PUSH' | 'FEISHU';
  enabled: boolean;
  maskedHint?: string | null;
  createdAt?: string;
  updatedAt: string;
}
export type ManualRecordType =
  'FOOD' | 'WATER' | 'WEIGHT' | 'STOOL' | 'VOMIT' | 'MEDICATION' | 'LITTER';
export type CreatableRecordType = ManualRecordType | 'PHOTO';
export interface RecordPhotoSummary {
  id: string;
  width?: number | null;
  height?: number | null;
  note?: string | null;
  createdAt?: string;
  downloadUrl: string;
  thumbnailUrl: string;
}
export interface RecordSummary {
  id: string;
  clientId: string;
  petId: string | null;
  authorId: string;
  type: PlanType;
  title: string;
  source: 'MANUAL' | 'TASK';
  status: 'ACTIVE' | 'REVERSED' | 'DELETED';
  abnormal: boolean;
  occurredAt: string;
  data: Record<string, unknown>;
  note?: string | null;
  version: number;
  pet?: { id: string; name: string } | null;
  author?: { id: string; displayName: string | null };
  photos?: RecordPhotoSummary[];
}
export interface PetWeightPoint {
  recordId: string;
  occurredAt: string;
  weightKg: number;
  bucket: string;
}
export interface PetWeightTrend {
  petId: string;
  bucket: 'day' | 'raw';
  timezone: string;
  points: PetWeightPoint[];
}
export interface PetProfileRecordSummary {
  id: string;
  type: PlanType;
  title: string;
  abnormal: boolean;
  occurredAt: string;
  data: Record<string, unknown>;
  note?: string | null;
}
export interface PetProfileMedicalRecordSummary {
  id: string;
  type: MedicalRecordType;
  title: string;
  occurredAt: string;
  brand?: string | null;
  batchNumber?: string | null;
  dose?: string | null;
  provider?: string | null;
  nextDueAt?: string | null;
  reaction?: string | null;
  note?: string | null;
  version: number;
}
export interface PetProfileHealthEventSummary {
  id: string;
  title: string;
  status: 'ACTIVE' | 'RECOVERED';
  startedAt: string;
  recoveredAt?: string | null;
  summary?: string | null;
  version: number;
}
export interface HealthEventSummary {
  id: string;
  familyId: string;
  petId: string;
  title: string;
  status: 'ACTIVE' | 'RECOVERED';
  startedAt: string;
  recoveredAt?: string | null;
  summary?: string | null;
  version: number;
  createdById: string;
  pet: { id: string; name: string };
  records: Array<{
    relationType: string;
    record: Pick<
      RecordSummary,
      'id' | 'type' | 'title' | 'occurredAt' | 'abnormal' | 'data' | 'note'
    >;
  }>;
}
export type MedicalRecordType = 'VACCINE' | 'DEWORMING' | 'MEDICATION';
export interface MedicalRecordSummary {
  id: string;
  familyId: string;
  petId: string;
  type: MedicalRecordType;
  title: string;
  occurredAt: string;
  brand?: string | null;
  batchNumber?: string | null;
  dose?: string | null;
  provider?: string | null;
  nextDueAt?: string | null;
  reaction?: string | null;
  note?: string | null;
  version: number;
  pet: { id: string; name: string };
}
export interface PhotoSummary {
  id: string;
  familyId: string;
  createdById: string;
  objectKey: string;
  mimeType: string;
  byteSize: number;
  thumbnailObjectKey?: string | null;
  thumbnailMimeType?: string | null;
  thumbnailByteSize?: number | null;
  thumbnailChecksum?: string | null;
  checksum: string;
  width?: number | null;
  height?: number | null;
  note?: string | null;
  version: number;
  createdAt: string;
  downloadUrl: string;
  thumbnailUrl: string;
  pets: Array<{ petId: string; pet: { id: string; name: string } }>;
  records: Array<{ recordId: string }>;
  createdBy: { id: string; displayName: string | null };
}
export interface PetProfileSummary {
  generatedAt: string;
  timezone: string;
  pet: PetSummary & {
    sex?: string | null;
    breed?: string | null;
    birthDate?: string | null;
    neutered?: boolean | null;
    chipNumber?: string | null;
    createdAt?: string;
    updatedAt?: string;
  };
  care: {
    activePlanCount: number;
    pendingTaskCount: number;
    overdueTaskCount: number;
  };
  weight: {
    latest: PetWeightPoint | null;
    trend: PetWeightPoint[];
  };
  medical: {
    counts: {
      vaccines: number;
      deworming: number;
      medications: number;
    };
    latestRecords: PetProfileMedicalRecordSummary[];
    nextDue: PetProfileMedicalRecordSummary[];
  };
  health: {
    activeEvents: PetProfileHealthEventSummary[];
    abnormalRecordCount30d: number;
  };
  recentRecords: PetProfileRecordSummary[];
  photos: PhotoSummary[];
}
export interface PhotoPresign {
  uploadUrl: string;
  objectKey: string;
  headers: Record<string, string>;
  expiresAt: string;
  provider: 'COS' | 'LOCAL';
}
export interface NotificationPreference {
  taskReminderEnabled: boolean;
  pushEnabled: boolean;
  overdueEnabled: boolean;
  updatedAt: string;
}
export interface PushTestResult {
  success: boolean;
  providerMessageId?: string | null;
  sentAt: string;
}
export interface AccountDeletionStatus {
  status: 'ACTIVE' | 'PENDING_DELETION' | 'DELETED';
  requestedAt: string | null;
  coolingEndsAt: string | null;
  canCancel: boolean;
}
export interface ExportJobSummary {
  id: string;
  familyId: string;
  requestedById: string;
  scope: 'FAMILY' | 'PERSONAL';
  format: 'JSON' | 'CSV';
  status: 'QUEUED' | 'PROCESSING' | 'READY' | 'FAILED' | 'EXPIRED';
  byteSize?: number | null;
  errorCode?: string | null;
  completedAt?: string | null;
  expiresAt?: string | null;
  createdAt: string;
  updatedAt: string;
}
export interface OfflineTaskOperation {
  id: string;
  familyId: string;
  path: string;
  body: Record<string, unknown>;
  idempotencyKey: string;
}
export type OfflineOperation = OfflineTaskOperation;

let refreshInFlight: Promise<AuthSession> | null = null;
let onSessionRefreshed: ((session: AuthSession) => void) | null = null;
let onSessionExpired: (() => void) | null = null;

export function configureAuthSessionRuntime(callbacks: {
  onRefreshed(session: AuthSession): void;
  onExpired(): void;
}) {
  onSessionRefreshed = callbacks.onRefreshed;
  onSessionExpired = callbacks.onExpired;
  return () => {
    onSessionRefreshed = null;
    onSessionExpired = null;
  };
}

export const authApi = {
  sendCode(phone: string) {
    return post<{ cooldownSeconds: number }>('/auth/sms/send', { phone, purpose: 'login' });
  },
  verifyCode(phone: string, code: string, deviceId: string) {
    return post<AuthSession>('/auth/sms/verify', {
      phone,
      code,
      device: {
        deviceId,
        platform: Platform.OS === 'ios' ? 'IOS' : 'ANDROID',
        deviceName: Platform.OS,
      },
    });
  },
  refresh(refreshToken: string) {
    return post<AuthSession>('/auth/refresh', { refreshToken });
  },
  createFamily(accessToken: string, name: string) {
    return authenticatedPost<FamilySummary>('/families', accessToken, undefined, {
      name,
      timezone: 'Asia/Shanghai',
    });
  },
  createPet(accessToken: string, familyId: string, name: string) {
    return authenticatedPost<PetSummary>('/pets', accessToken, familyId, { name, sex: 'UNKNOWN' });
  },
  async logout(accessToken: string) {
    const response = await authenticatedFetch('/auth/logout', accessToken, { method: 'POST' });
    if (!response.ok && response.status !== 401)
      throw new AuthApiError('LOGOUT_FAILED', '退出登录失败');
  },
  listPets(accessToken: string, familyId: string) {
    return authenticatedGet<PetSummary[]>('/pets', accessToken, familyId);
  },
  listMembers(accessToken: string, familyId: string) {
    return authenticatedGet<MemberSummary[]>(`/families/${familyId}/members`, accessToken);
  },
  getPet(accessToken: string, familyId: string, petId: string) {
    return authenticatedGet<
      PetSummary & {
        sex?: string | null;
        breed?: string | null;
        birthDate?: string | null;
        neutered?: boolean | null;
        chipNumber?: string | null;
      }
    >(`/pets/${petId}`, accessToken, familyId);
  },
  getPetProfileSummary(accessToken: string, familyId: string, petId: string) {
    return authenticatedGet<PetProfileSummary>(
      `/pets/${petId}/profile-summary`,
      accessToken,
      familyId,
    );
  },
  getPetWeightTrend(
    accessToken: string,
    familyId: string,
    petId: string,
    bucket: 'day' | 'raw' = 'day',
  ) {
    return authenticatedGet<PetWeightTrend>(
      `/pets/${petId}/weight-trend?bucket=${bucket}`,
      accessToken,
      familyId,
    );
  },
  updatePet(
    accessToken: string,
    familyId: string,
    petId: string,
    input: {
      name: string;
      sex?: string;
      birthDate?: string | null;
      breed?: string | null;
      neutered?: boolean | null;
      chipNumber?: string | null;
      version: number;
    },
  ) {
    return authenticatedPatch<PetSummary>(`/pets/${petId}`, accessToken, familyId, input);
  },
  inviteMember(accessToken: string, familyId: string, phone: string, role: 'ADMIN' | 'MEMBER') {
    return authenticatedPost<{ id: string; role: string; expiresAt: string; token?: string }>(
      `/families/${familyId}/invites`,
      accessToken,
      undefined,
      { phone, role },
    );
  },
  acceptInvite(accessToken: string, token: string) {
    return authenticatedPost<FamilySummary>(
      `/family-invites/${encodeURIComponent(token)}/accept`,
      accessToken,
      undefined,
      {},
    );
  },
  changeMemberRole(
    accessToken: string,
    familyId: string,
    memberId: string,
    role: 'ADMIN' | 'MEMBER',
  ) {
    return authenticatedPatch<MemberSummary>(
      `/families/${familyId}/members/${memberId}`,
      accessToken,
      undefined,
      { role },
    );
  },
  removeMember(accessToken: string, familyId: string, memberId: string) {
    return authenticatedDelete(`/families/${familyId}/members/${memberId}`, accessToken);
  },
  deletePet(accessToken: string, familyId: string, petId: string, version: number) {
    return authenticatedDelete(`/pets/${petId}`, accessToken, familyId, {
      'If-Match': String(version),
    });
  },
  createPlan(
    accessToken: string,
    familyId: string,
    input: {
      petId?: string | null;
      assigneeId?: string | null;
      type: PlanType;
      title: string;
      detail?: string;
      startAt: string;
      localTime: string;
      recurrenceRule: {
        frequency: 'once' | 'daily' | 'weekly' | 'monthly' | 'intervalMonths';
        interval?: number;
        weekdays?: number[];
        dayOfMonth?: number;
      };
    },
  ) {
    return authenticatedPost<PlanSummary>('/plans', accessToken, familyId, {
      ...input,
      timezone: 'Asia/Shanghai',
    });
  },
  listPlans(accessToken: string, familyId: string, enabled?: boolean) {
    const query = enabled === undefined ? '' : `?enabled=${enabled}`;
    return authenticatedGet<PlanSummary[]>(`/plans${query}`, accessToken, familyId);
  },
  getPlan(accessToken: string, familyId: string, planId: string) {
    return authenticatedGet<PlanSummary>(`/plans/${planId}`, accessToken, familyId);
  },
  updatePlan(
    accessToken: string,
    familyId: string,
    planId: string,
    input: {
      petId?: string | null;
      assigneeId?: string | null;
      type?: PlanType;
      title?: string;
      detail?: string;
      startAt?: string;
      localTime?: string;
      recurrenceRule?: {
        frequency: 'once' | 'daily' | 'weekly' | 'monthly' | 'intervalMonths';
        interval?: number;
        weekdays?: number[];
        dayOfMonth?: number;
      };
      version: number;
      futureTaskPolicy: 'keep' | 'regenerate';
    },
  ) {
    return authenticatedPatch<PlanSummary>(`/plans/${planId}`, accessToken, familyId, {
      ...input,
      timezone: 'Asia/Shanghai',
    });
  },
  pausePlan(accessToken: string, familyId: string, planId: string, version: number) {
    return authenticatedPost<PlanSummary>(`/plans/${planId}/pause`, accessToken, familyId, {
      version,
    });
  },
  resumePlan(accessToken: string, familyId: string, planId: string, version: number) {
    return authenticatedPost<PlanSummary>(`/plans/${planId}/resume`, accessToken, familyId, {
      version,
    });
  },
  deletePlan(accessToken: string, familyId: string, planId: string, version: number) {
    return authenticatedDelete(`/plans/${planId}`, accessToken, familyId, {
      'If-Match': String(version),
    });
  },
  listTasks(
    accessToken: string,
    familyId: string,
    scope: 'today' | 'upcoming' | 'overdue' | 'completed',
  ) {
    return authenticatedGet<{
      items: TaskSummary[];
      page: { hasMore: boolean; nextCursor: string | null };
    }>(`/tasks?scope=${scope}&limit=100`, accessToken, familyId);
  },
  getTask(accessToken: string, familyId: string, taskId: string) {
    return authenticatedGet<TaskSummary>(`/tasks/${taskId}`, accessToken, familyId);
  },
  createCompleteOperation(
    familyId: string,
    task: TaskSummary,
    input?: CompleteTaskInput,
  ): OfflineTaskOperation {
    const actualAt = input?.actualAt ?? new Date().toISOString();
    const note = input?.note?.trim();
    return createTaskOperation(familyId, `/tasks/${task.id}/complete`, 'complete', task.id, {
      actualAt,
      result: input?.result ?? {},
      version: task.version,
      ...(note ? { note } : {}),
      medicalConfirmed: input?.medicalConfirmed ?? false,
    });
  },
  createSkipOperation(familyId: string, task: TaskSummary): OfflineTaskOperation {
    return createTaskOperation(familyId, `/tasks/${task.id}/skip`, 'skip', task.id, {
      version: task.version,
    });
  },
  createUndoOperation(familyId: string, task: TaskSummary): OfflineTaskOperation {
    return createTaskOperation(familyId, `/tasks/${task.id}/undo`, 'undo', task.id, {
      version: task.version,
    });
  },
  sendTaskOperation(accessToken: string, operation: OfflineTaskOperation) {
    return authenticatedPost<TaskMutationResult>(
      operation.path,
      accessToken,
      operation.familyId,
      operation.body,
      { 'Idempotency-Key': operation.idempotencyKey },
    );
  },
  registerPushToken(accessToken: string, token: string, platform: 'IOS' | 'ANDROID') {
    return authenticatedPost<{ id: string; active: boolean }>(
      '/devices/push-token',
      accessToken,
      undefined,
      { token, platform, provider: 'EXPO' },
    );
  },
  listRecords(accessToken: string, familyId: string, petId?: string) {
    const query = new URLSearchParams({ limit: '100', ...(petId ? { petId } : {}) });
    return authenticatedGet<{ items: RecordSummary[]; nextCursor: string | null }>(
      `/records?${query}`,
      accessToken,
      familyId,
    );
  },
  createRecord(
    accessToken: string,
    familyId: string,
    input: {
      clientId: string;
      petId: string | null;
      type: CreatableRecordType;
      title: string;
      occurredAt: string;
      abnormal: boolean;
      data: Record<string, unknown>;
      note?: string;
    },
  ) {
    return authenticatedPost<RecordSummary>('/records', accessToken, familyId, input, {
      'Idempotency-Key': input.clientId,
    });
  },
  createRecordOperation(
    familyId: string,
    input: {
      clientId: string;
      petId: string | null;
      type: CreatableRecordType;
      title: string;
      occurredAt: string;
      abnormal: boolean;
      data: Record<string, unknown>;
      note?: string;
    },
  ): OfflineOperation {
    return {
      id: input.clientId,
      familyId,
      path: '/records',
      body: input,
      idempotencyKey: input.clientId,
    };
  },
  sendOfflineOperation(accessToken: string, operation: OfflineOperation) {
    return authenticatedPost<unknown>(
      operation.path,
      accessToken,
      operation.familyId,
      operation.body,
      { 'Idempotency-Key': operation.idempotencyKey },
    );
  },
  getRecord(accessToken: string, familyId: string, recordId: string) {
    return authenticatedGet<RecordSummary>(`/records/${recordId}`, accessToken, familyId);
  },
  updateRecord(
    accessToken: string,
    familyId: string,
    recordId: string,
    input: {
      title?: string;
      occurredAt?: string;
      data?: Record<string, unknown>;
      note?: string;
      abnormal?: boolean;
      version: number;
    },
  ) {
    return authenticatedPatch<RecordSummary>(`/records/${recordId}`, accessToken, familyId, input);
  },
  deleteRecord(accessToken: string, familyId: string, recordId: string, version: number) {
    return authenticatedDeleteWithBody(`/records/${recordId}`, accessToken, familyId, { version });
  },
  listHealthEvents(accessToken: string, familyId: string, status?: 'ACTIVE' | 'RECOVERED') {
    return authenticatedGet<HealthEventSummary[]>(
      `/health-events${status ? `?status=${status}` : ''}`,
      accessToken,
      familyId,
    );
  },
  getHealthEvent(accessToken: string, familyId: string, eventId: string) {
    return authenticatedGet<HealthEventSummary>(`/health-events/${eventId}`, accessToken, familyId);
  },
  createHealthEvent(
    accessToken: string,
    familyId: string,
    input: {
      petId: string;
      title: string;
      startedAt: string;
      summary?: string;
      recordIds: string[];
      clientId: string;
    },
  ) {
    const { clientId, ...body } = input;
    return authenticatedPost<HealthEventSummary>('/health-events', accessToken, familyId, body, {
      'Idempotency-Key': clientId,
    });
  },
  recoverHealthEvent(accessToken: string, familyId: string, eventId: string, version: number) {
    return authenticatedPost<HealthEventSummary>(
      `/health-events/${eventId}/recover`,
      accessToken,
      familyId,
      { recoveredAt: new Date().toISOString(), version },
    );
  },
  updateHealthEvent(
    accessToken: string,
    familyId: string,
    eventId: string,
    input: { title?: string; summary?: string; version: number },
  ) {
    return authenticatedPatch<HealthEventSummary>(
      `/health-events/${eventId}`,
      accessToken,
      familyId,
      input,
    );
  },
  addHealthEventRecord(
    accessToken: string,
    familyId: string,
    eventId: string,
    recordId: string,
    relationType: 'SYMPTOM' | 'OBSERVATION' | 'TREATMENT',
  ) {
    return authenticatedPost<HealthEventSummary>(
      `/health-events/${eventId}/records`,
      accessToken,
      familyId,
      { recordId, relationType },
    );
  },
  removeHealthEventRecord(
    accessToken: string,
    familyId: string,
    eventId: string,
    recordId: string,
  ) {
    return authenticatedDelete(
      `/health-events/${eventId}/records/${recordId}`,
      accessToken,
      familyId,
    );
  },
  listMedicalRecords(accessToken: string, familyId: string, petId?: string) {
    return authenticatedGet<MedicalRecordSummary[]>(
      `/medical-records${petId ? `?petId=${petId}` : ''}`,
      accessToken,
      familyId,
    );
  },
  createMedicalRecord(
    accessToken: string,
    familyId: string,
    input: {
      petId: string;
      type: MedicalRecordType;
      title: string;
      occurredAt: string;
      brand?: string;
      batchNumber?: string;
      dose?: string;
      provider?: string;
      nextDueAt?: string | null;
      reaction?: string;
      note?: string;
    },
  ) {
    return authenticatedPost<MedicalRecordSummary>(
      '/medical-records',
      accessToken,
      familyId,
      input,
    );
  },
  getMedicalRecord(accessToken: string, familyId: string, recordId: string) {
    return authenticatedGet<MedicalRecordSummary>(
      `/medical-records/${recordId}`,
      accessToken,
      familyId,
    );
  },
  updateMedicalRecord(
    accessToken: string,
    familyId: string,
    recordId: string,
    input: Partial<Omit<MedicalRecordSummary, 'id' | 'familyId' | 'pet'>> & { version: number },
  ) {
    return authenticatedPatch<MedicalRecordSummary>(
      `/medical-records/${recordId}`,
      accessToken,
      familyId,
      input,
    );
  },
  deleteMedicalRecord(accessToken: string, familyId: string, recordId: string, version: number) {
    return authenticatedDeleteWithBody(`/medical-records/${recordId}`, accessToken, familyId, {
      version,
    });
  },
  async downloadMedicalSummary(accessToken: string, familyId: string, petId: string) {
    const response = await authenticatedFetch(
      `/medical-summary?petId=${petId}&format=pdf`,
      accessToken,
      { headers: { 'X-Family-Id': familyId } },
    );
    if (!response.ok) {
      const payload = (await response.json()) as ApiErrorEnvelope;
      throw new AuthApiError(payload.error.code, payload.error.message);
    }
    return new Uint8Array(await response.arrayBuffer());
  },
  presignPhoto(
    accessToken: string,
    familyId: string,
    input: {
      fileName: string;
      mimeType: string;
      byteSize: number;
      purpose?: 'PHOTO' | 'PHOTO_THUMBNAIL' | 'PET_AVATAR' | 'RECORD_ATTACHMENT';
    },
  ) {
    return authenticatedPost<PhotoPresign>('/uploads/presign', accessToken, familyId, {
      ...input,
      purpose: input.purpose ?? 'PHOTO',
    });
  },
  async uploadPhotoBinary(presign: PhotoPresign, body: Blob) {
    const response = await fetch(presign.uploadUrl, {
      method: 'PUT',
      headers: presign.headers,
      body,
    });
    if (!response.ok) {
      let message = '图片上传失败';
      try {
        const payload = (await response.json()) as ApiErrorEnvelope;
        message = payload.error.message;
      } catch {
        /* COS may return XML */
      }
      throw new AuthApiError('PHOTO_UPLOAD_FAILED', message);
    }
    return response.headers.get('etag')?.replace(/^"|"$/g, '') || undefined;
  },
  createPhoto(
    accessToken: string,
    familyId: string,
    input: {
      objectKey: string;
      thumbnailObjectKey: string;
      petIds: string[];
      note?: string;
      checksum?: string;
      thumbnailChecksum?: string;
      width?: number;
      height?: number;
      recordId?: string;
    },
  ) {
    return authenticatedPost<PhotoSummary>('/photos', accessToken, familyId, input);
  },
  listPhotos(accessToken: string, familyId: string, petId?: string) {
    return authenticatedGet<{ items: PhotoSummary[]; nextCursor: string | null }>(
      `/photos?limit=50${petId ? `&petId=${petId}` : ''}`,
      accessToken,
      familyId,
    );
  },
  getPhoto(accessToken: string, familyId: string, photoId: string) {
    return authenticatedGet<PhotoSummary>(`/photos/${photoId}`, accessToken, familyId);
  },
  updatePhoto(
    accessToken: string,
    familyId: string,
    photoId: string,
    input: { petIds?: string[]; note?: string | null; version: number },
  ) {
    return authenticatedPatch<PhotoSummary>(`/photos/${photoId}`, accessToken, familyId, input);
  },
  deletePhoto(accessToken: string, familyId: string, photoId: string, version: number) {
    return authenticatedDelete(`/photos/${photoId}`, accessToken, familyId, {
      'If-Match': String(version),
    });
  },
  setPhotoAvatar(accessToken: string, familyId: string, photoId: string, petId: string) {
    return authenticatedPost<{ petId: string; photoId: string; avatarUrl: string }>(
      `/photos/${photoId}/set-avatar`,
      accessToken,
      familyId,
      { petId },
    );
  },
  getNotificationPreference(accessToken: string, familyId: string) {
    return authenticatedGet<NotificationPreference>(
      '/notification-preferences/me',
      accessToken,
      familyId,
    );
  },
  updateNotificationPreference(
    accessToken: string,
    familyId: string,
    input: Partial<
      Pick<NotificationPreference, 'taskReminderEnabled' | 'pushEnabled' | 'overdueEnabled'>
    >,
  ) {
    return authenticatedPatch<NotificationPreference>(
      '/notification-preferences/me',
      accessToken,
      familyId,
      input,
    );
  },
  testCurrentDevicePush(accessToken: string, familyId: string) {
    return authenticatedPost<PushTestResult>(
      '/notification-preferences/me/test-push',
      accessToken,
      familyId,
      {},
    );
  },
  listNotificationChannels(accessToken: string, familyId: string) {
    return authenticatedGet<NotificationChannelSummary[]>(
      '/notification-channels',
      accessToken,
      familyId,
    );
  },
  configureFeishuChannel(accessToken: string, familyId: string, webhookUrl: string) {
    return authenticatedPut<NotificationChannelSummary>(
      '/notification-channels/feishu',
      accessToken,
      familyId,
      { webhookUrl },
    );
  },
  testFeishuChannel(accessToken: string, familyId: string) {
    return authenticatedPost<{ success: boolean }>(
      '/notification-channels/feishu/test',
      accessToken,
      familyId,
      {},
    );
  },
  removeFeishuChannel(accessToken: string, familyId: string) {
    return authenticatedDelete('/notification-channels/feishu', accessToken, familyId);
  },
  listNotificationLogs(
    accessToken: string,
    familyId: string,
    status?: NotificationStatus,
    cursor?: string,
  ) {
    const query = new URLSearchParams({ limit: '20' });
    if (status) query.set('status', status);
    if (cursor) query.set('cursor', cursor);
    return authenticatedGet<{
      items: NotificationLogSummary[];
      page: { hasMore: boolean; nextCursor: string | null };
    }>(`/notification-logs?${query.toString()}`, accessToken, familyId);
  },
  retryNotificationLog(accessToken: string, familyId: string, notificationLogId: string) {
    return authenticatedPost<NotificationLogSummary>(
      `/notification-logs/${notificationLogId}/retry`,
      accessToken,
      familyId,
      {},
    );
  },
  getAccountDeletionStatus(accessToken: string) {
    return authenticatedGet<AccountDeletionStatus>('/account/deletion-status', accessToken);
  },
  sendAccountDeletionCode(accessToken: string) {
    return authenticatedPost<{ cooldownSeconds: number; maskedPhone: string }>(
      '/account/deletion-code',
      accessToken,
      undefined,
      {},
    );
  },
  requestAccountDeletion(accessToken: string, code: string) {
    return authenticatedPost<AccountDeletionStatus>(
      '/account/deletion-request',
      accessToken,
      undefined,
      { code },
    );
  },
  cancelAccountDeletion(accessToken: string) {
    return authenticatedDeleteJson<AccountDeletionStatus>('/account/deletion-request', accessToken);
  },
  createExport(
    accessToken: string,
    familyId: string,
    format: 'JSON' | 'CSV',
    scope: 'FAMILY' | 'PERSONAL',
    idempotencyKey: string,
  ) {
    return authenticatedPost<ExportJobSummary>(
      '/exports',
      accessToken,
      familyId,
      { format, scope },
      { 'Idempotency-Key': idempotencyKey },
    );
  },
  getExport(accessToken: string, familyId: string, exportId: string) {
    return authenticatedGet<ExportJobSummary>(`/exports/${exportId}`, accessToken, familyId);
  },
  async downloadExport(accessToken: string, familyId: string, exportId: string) {
    const link = await authenticatedGet<{ downloadUrl: string; expiresAt: string }>(
      `/exports/${exportId}/download`,
      accessToken,
      familyId,
    );
    const response = await fetch(apiResourceUrl(link.downloadUrl));
    if (!response.ok) throw new AuthApiError('EXPORT_DOWNLOAD_FAILED', '导出文件下载失败');
    return new Uint8Array(await response.arrayBuffer());
  },
};

async function authenticatedPost<T>(
  path: string,
  accessToken: string,
  familyId: string | undefined,
  body: unknown,
  extraHeaders?: Record<string, string>,
): Promise<T> {
  const response = await authenticatedFetch(path, accessToken, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(familyId ? { 'X-Family-Id': familyId } : {}),
      ...extraHeaders,
    },
    body: JSON.stringify(body),
  });
  const payload = (await response.json()) as ApiEnvelope<T> | ApiErrorEnvelope;
  if (!response.ok || 'error' in payload) {
    const error =
      'error' in payload ? payload.error : { code: 'NETWORK_ERROR', message: '网络请求失败' };
    throw new AuthApiError(error.code, error.message, error.details);
  }
  return payload.data;
}

function operationKey(action: string, resourceId: string) {
  return `${action}-${resourceId}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function createTaskOperation(
  familyId: string,
  path: string,
  action: string,
  resourceId: string,
  body: Record<string, unknown>,
): OfflineTaskOperation {
  const idempotencyKey = operationKey(action, resourceId);
  return { id: idempotencyKey, familyId, path, body, idempotencyKey };
}

async function authenticatedGet<T>(
  path: string,
  accessToken: string,
  familyId?: string,
): Promise<T> {
  const response = await authenticatedFetch(path, accessToken, {
    headers: { ...(familyId ? { 'X-Family-Id': familyId } : {}) },
  });
  const payload = (await response.json()) as ApiEnvelope<T> | ApiErrorEnvelope;
  if (!response.ok || 'error' in payload) {
    const error =
      'error' in payload ? payload.error : { code: 'NETWORK_ERROR', message: '网络请求失败' };
    throw new AuthApiError(error.code, error.message, error.details);
  }
  return payload.data;
}

async function authenticatedPatch<T>(
  path: string,
  accessToken: string,
  familyId: string | undefined,
  body: unknown,
): Promise<T> {
  const response = await authenticatedFetch(path, accessToken, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...(familyId ? { 'X-Family-Id': familyId } : {}),
    },
    body: JSON.stringify(body),
  });
  const payload = (await response.json()) as ApiEnvelope<T> | ApiErrorEnvelope;
  if (!response.ok || 'error' in payload) {
    const error =
      'error' in payload ? payload.error : { code: 'NETWORK_ERROR', message: '网络请求失败' };
    throw new AuthApiError(error.code, error.message, error.details);
  }
  return payload.data;
}

async function authenticatedPut<T>(
  path: string,
  accessToken: string,
  familyId: string | undefined,
  body: unknown,
): Promise<T> {
  const response = await authenticatedFetch(path, accessToken, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...(familyId ? { 'X-Family-Id': familyId } : {}),
    },
    body: JSON.stringify(body),
  });
  const payload = (await response.json()) as ApiEnvelope<T> | ApiErrorEnvelope;
  if (!response.ok || 'error' in payload) {
    const error =
      'error' in payload ? payload.error : { code: 'NETWORK_ERROR', message: '网络请求失败' };
    throw new AuthApiError(error.code, error.message, error.details);
  }
  return payload.data;
}

async function authenticatedDelete(
  path: string,
  accessToken: string,
  familyId?: string,
  extraHeaders?: Record<string, string>,
) {
  const response = await authenticatedFetch(path, accessToken, {
    method: 'DELETE',
    headers: { ...(familyId ? { 'X-Family-Id': familyId } : {}), ...extraHeaders },
  });
  if (!response.ok) {
    const payload = (await response.json()) as ApiErrorEnvelope;
    throw new AuthApiError(payload.error.code, payload.error.message);
  }
}

async function authenticatedDeleteWithBody(
  path: string,
  accessToken: string,
  familyId: string,
  body: unknown,
) {
  const response = await authenticatedFetch(path, accessToken, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json', 'X-Family-Id': familyId },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const payload = (await response.json()) as ApiErrorEnvelope;
    throw new AuthApiError(payload.error.code, payload.error.message);
  }
}

async function authenticatedDeleteJson<T>(
  path: string,
  accessToken: string,
  familyId?: string,
): Promise<T> {
  const response = await authenticatedFetch(path, accessToken, {
    method: 'DELETE',
    headers: { ...(familyId ? { 'X-Family-Id': familyId } : {}) },
  });
  const payload = (await response.json()) as ApiEnvelope<T> | ApiErrorEnvelope;
  if (!response.ok || 'error' in payload) {
    const error =
      'error' in payload ? payload.error : { code: 'NETWORK_ERROR', message: '网络请求失败' };
    throw new AuthApiError(error.code, error.message, error.details);
  }
  return payload.data;
}

async function authenticatedFetch(path: string, accessToken: string, init: RequestInit = {}) {
  const firstHeaders = new Headers(init.headers);
  firstHeaders.set('Authorization', `Bearer ${accessToken}`);
  let response = await fetch(`${baseUrl}${path}`, { ...init, headers: firstHeaders });
  if (response.status !== 401) return response;

  const refreshed = await refreshSessionOnce();
  const retryHeaders = new Headers(init.headers);
  retryHeaders.set('Authorization', `Bearer ${refreshed.accessToken}`);
  response = await fetch(`${baseUrl}${path}`, { ...init, headers: retryHeaders });
  return response;
}

async function refreshSessionOnce() {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    try {
      const refreshToken = await getRefreshToken();
      if (!refreshToken) throw new AuthApiError('REFRESH_TOKEN_MISSING', '登录状态已失效');
      const session = await post<AuthSession>('/auth/refresh', { refreshToken });
      await saveAuthSession(session);
      onSessionRefreshed?.(session);
      return session;
    } catch (error) {
      if (isTerminalSessionError(error)) {
        await clearAuthSession();
        onSessionExpired?.();
      }
      throw error;
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}
