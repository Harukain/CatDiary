import { describe, expect, it } from 'vitest';
import {
  canOperateFamilyMember,
  familyMemberDisplayName,
  familyMemberRoleChangeCopy,
  memberOperationKey,
  nextFamilyMemberRole,
  normalizeInvitePhone,
} from './member-actions';

const member = {
  role: 'MEMBER' as const,
  user: { id: 'member-user', displayName: '  小林  ' },
};

describe('family member action rules', () => {
  it('normalizes invite phone numbers to eleven digits', () => {
    expect(normalizeInvitePhone('138 0013-8000')).toBe('13800138000');
    expect(normalizeInvitePhone('+86 13800138000123')).toBe('13800138000');
  });

  it('uses self and fallback display names safely', () => {
    expect(familyMemberDisplayName(member, 'member-user')).toBe('我');
    expect(familyMemberDisplayName(member, 'owner-user')).toBe('小林');
    expect(
      familyMemberDisplayName(
        { role: 'MEMBER', user: { id: 'unknown-user', displayName: '   ' } },
        'owner-user',
      ),
    ).toBe('家庭成员');
  });

  it('only lets managers operate non-owner, non-self members', () => {
    expect(
      canOperateFamilyMember({
        currentRole: 'ADMIN',
        currentUserId: 'admin-user',
        member,
      }),
    ).toBe(true);
    expect(
      canOperateFamilyMember({
        currentRole: 'MEMBER',
        currentUserId: 'member-user',
        member,
      }),
    ).toBe(false);
    expect(
      canOperateFamilyMember({
        currentRole: 'OWNER',
        currentUserId: 'owner-user',
        member: { role: 'OWNER', user: { id: 'founder-user', displayName: '创建者' } },
      }),
    ).toBe(false);
    expect(
      canOperateFamilyMember({
        currentRole: 'ADMIN',
        currentUserId: 'member-user',
        member,
      }),
    ).toBe(false);
  });

  it('only toggles assignable admin/member roles', () => {
    expect(nextFamilyMemberRole('MEMBER')).toBe('ADMIN');
    expect(nextFamilyMemberRole('ADMIN')).toBe('MEMBER');
    expect(nextFamilyMemberRole('OWNER')).toBeNull();
  });

  it('builds explicit copy for role changes', () => {
    expect(familyMemberRoleChangeCopy('小林', 'MEMBER')).toMatchObject({
      nextRole: 'ADMIN',
      title: '设为管理员？',
      confirmLabel: '设为管理员',
    });
    expect(familyMemberRoleChangeCopy('小林', 'ADMIN')).toMatchObject({
      nextRole: 'MEMBER',
      title: '设为普通成员？',
      confirmLabel: '设为成员',
    });
    expect(familyMemberRoleChangeCopy('创建者', 'OWNER')).toBeNull();
  });

  it('creates stable per-row operation keys', () => {
    expect(memberOperationKey('role', 'member-a')).toBe('role:member-a');
    expect(memberOperationKey('remove', 'member-a')).toBe('remove:member-a');
  });
});
