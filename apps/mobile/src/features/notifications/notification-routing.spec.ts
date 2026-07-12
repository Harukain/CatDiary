import { describe, expect, it } from 'vitest';
import { taskTargetFromNotification } from './notification-routing';

const families = new Set(['family_12345678']);

describe('taskTargetFromNotification', () => {
  it('routes a valid task payload in the signed-in family set', () => {
    expect(
      taskTargetFromNotification(
        { taskId: 'task_12345678', familyId: 'family_12345678' },
        families,
      ),
    ).toEqual({
      taskId: 'task_12345678',
      familyId: 'family_12345678',
      path: '/tasks/task_12345678',
    });
  });

  it('rejects cross-family and malformed push data', () => {
    expect(
      taskTargetFromNotification(
        { taskId: 'task_12345678', familyId: 'family_87654321' },
        families,
      ),
    ).toBeNull();
    expect(
      taskTargetFromNotification(
        { taskId: '../settings/account', familyId: 'family_12345678' },
        families,
      ),
    ).toBeNull();
    expect(taskTargetFromNotification('not-an-object', families)).toBeNull();
  });
});
