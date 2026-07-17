import { describe, expect, it } from 'vitest';
import type { TaskMutationResult, TaskSummary } from '../auth/auth-api';
import {
  optimisticCompletedTask,
  optimisticPendingTask,
  recordIdFromTaskMutationResult,
  taskFromMutationResult,
} from './task-mutation';

const task: TaskSummary = {
  id: 'task-1',
  planId: 'plan-1',
  petId: 'pet-1',
  title: '清理猫砂盆',
  type: 'LITTER',
  status: 'PENDING',
  scheduledAt: '2026-07-15T01:00:00.000Z',
  version: 3,
  pet: { id: 'pet-1', name: '福宝' },
};

describe('task mutation feedback', () => {
  it('keeps list relations when the mutation response only returns the task row', () => {
    const next = taskFromMutationResult(
      { ...task, status: 'COMPLETED', version: 4, pet: undefined },
      task,
    );

    expect(next.status).toBe('COMPLETED');
    expect(next.version).toBe(4);
    expect(next.pet?.name).toBe('福宝');
  });

  it('extracts a completed task from the complete response envelope', () => {
    const result: TaskMutationResult = {
      task: { ...task, status: 'COMPLETED', version: 4 },
      record: { id: 'record-1' },
    };
    const next = taskFromMutationResult(result, task);

    expect(next.status).toBe('COMPLETED');
    expect(next.version).toBe(4);
    expect(recordIdFromTaskMutationResult(result)).toBe('record-1');
  });

  it('ignores complete responses without a safe generated record id', () => {
    expect(recordIdFromTaskMutationResult(task)).toBeNull();
    expect(
      recordIdFromTaskMutationResult({
        task: { ...task, status: 'COMPLETED', version: 4 },
        record: { id: 123 },
      }),
    ).toBeNull();
  });

  it('advances versions for an offline complete followed by undo', () => {
    const completed = optimisticCompletedTask(task, '2026-07-15T01:05:00.000Z');
    const pending = optimisticPendingTask(completed);

    expect(completed).toMatchObject({ status: 'COMPLETED', version: 4 });
    expect(pending).toMatchObject({ status: 'PENDING', completedAt: null, version: 5 });
  });
});
