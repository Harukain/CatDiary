import type { TaskMutationResult, TaskSummary } from '../auth/auth-api';

type MutationRecord = { id?: unknown };

export function taskFromMutationResult(
  result: TaskMutationResult,
  fallback: TaskSummary,
): TaskSummary {
  const task = 'task' in result ? result.task : result;
  return {
    ...fallback,
    ...task,
    pet: task.pet ?? fallback.pet,
    assignee: task.assignee ?? fallback.assignee,
  };
}

export function recordIdFromTaskMutationResult(result: TaskMutationResult): string | null {
  if (!('record' in result)) return null;
  const record = result.record as MutationRecord | null;
  return typeof record?.id === 'string' && record.id ? record.id : null;
}

export function optimisticCompletedTask(
  task: TaskSummary,
  completedAt = new Date().toISOString(),
): TaskSummary {
  return {
    ...task,
    status: 'COMPLETED',
    completedAt,
    version: task.version + 1,
  };
}

export function optimisticPendingTask(task: TaskSummary): TaskSummary {
  return {
    ...task,
    status: 'PENDING',
    completedAt: null,
    version: task.version + 1,
  };
}
