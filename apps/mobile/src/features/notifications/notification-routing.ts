export interface TaskNotificationTarget {
  taskId: string;
  familyId: string;
  path: `/tasks/${string}`;
}

/** Treats push payloads as untrusted input and only routes to a family in the active session. */
export function taskTargetFromNotification(
  data: unknown,
  allowedFamilyIds: ReadonlySet<string>,
): TaskNotificationTarget | null {
  if (!data || typeof data !== 'object') return null;
  const { taskId, familyId } = data as Record<string, unknown>;
  if (!safeIdentifier(taskId) || !safeIdentifier(familyId) || !allowedFamilyIds.has(familyId))
    return null;
  return { taskId, familyId, path: `/tasks/${taskId}` };
}

function safeIdentifier(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length >= 8 &&
    value.length <= 64 &&
    /^[A-Za-z0-9_-]+$/.test(value)
  );
}
