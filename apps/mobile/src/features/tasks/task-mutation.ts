import type { TaskMutationResult, TaskSummary } from '../auth/auth-api';

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
