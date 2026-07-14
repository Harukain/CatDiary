import { describe, expect, it } from 'vitest';
import type { RecordSummary } from '../auth/auth-api';
import { getRecordActionPermissions } from './record-permissions';

function record(overrides: Partial<Pick<RecordSummary, 'authorId' | 'source' | 'type'>> = {}) {
  return {
    authorId: 'member-a',
    source: 'MANUAL',
    type: 'FOOD',
    ...overrides,
  } satisfies Pick<RecordSummary, 'authorId' | 'source' | 'type'>;
}

describe('record action permissions', () => {
  it.each(['OWNER', 'ADMIN'] as const)('lets %s manage another member manual record', (role) => {
    const permissions = getRecordActionPermissions(record(), 'admin-user', role);

    expect(permissions.edit.allowed).toBe(true);
    expect(permissions.delete.allowed).toBe(true);
  });

  it('lets a member edit and delete their own ordinary manual record', () => {
    const permissions = getRecordActionPermissions(record(), 'member-a', 'MEMBER');

    expect(permissions.edit.allowed).toBe(true);
    expect(permissions.delete.allowed).toBe(true);
  });

  it('keeps another member ordinary record read-only', () => {
    const permissions = getRecordActionPermissions(record(), 'member-b', 'MEMBER');

    expect(permissions.edit.allowed).toBe(false);
    expect(permissions.delete.allowed).toBe(false);
    expect(permissions.edit.reason).toContain('其他家庭成员');
  });

  it.each(['MEDICATION', 'VACCINE', 'DEWORMING'] as const)(
    'only lets administrators manage a member-owned %s record',
    (type) => {
      const memberPermissions = getRecordActionPermissions(record({ type }), 'member-a', 'MEMBER');
      const adminPermissions = getRecordActionPermissions(record({ type }), 'admin-user', 'ADMIN');

      expect(memberPermissions.edit.allowed).toBe(false);
      expect(memberPermissions.delete.allowed).toBe(false);
      expect(memberPermissions.delete.reason).toContain('仅家庭管理员');
      expect(adminPermissions.edit.allowed).toBe(true);
      expect(adminPermissions.delete.allowed).toBe(true);
    },
  );

  it.each(['OWNER', 'ADMIN', 'MEMBER'] as const)(
    'keeps task-generated records immutable for %s',
    (role) => {
      const permissions = getRecordActionPermissions(
        record({ source: 'TASK', type: 'LITTER' }),
        role === 'MEMBER' ? 'member-a' : 'admin-user',
        role,
      );

      expect(permissions.edit.allowed).toBe(false);
      expect(permissions.delete.allowed).toBe(false);
      expect(permissions.edit.reason).toContain('撤销对应任务');
    },
  );

  it('fails closed when the active family role cannot be confirmed', () => {
    const permissions = getRecordActionPermissions(record(), 'member-a', undefined);

    expect(permissions.edit.allowed).toBe(false);
    expect(permissions.delete.allowed).toBe(false);
    expect(permissions.edit.reason).toContain('无法确认');
  });
});
