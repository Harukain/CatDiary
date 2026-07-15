export type ManageableFamilyRole = 'OWNER' | 'ADMIN' | 'MEMBER';

export type FamilyMemberActionTarget = {
  role: ManageableFamilyRole;
  user: { id: string; displayName: string | null };
};

export type MemberOperationKind = 'role' | 'remove';
export type MemberOperationKey = `${MemberOperationKind}:${string}`;
export type FamilyMemberRoleChangeCopy = {
  nextRole: 'ADMIN' | 'MEMBER';
  title: string;
  message: string;
  confirmLabel: string;
  success: string;
};

export function normalizeInvitePhone(value: string) {
  const digits = value.replace(/\D/g, '');
  const withoutCountryCode =
    digits.startsWith('86') && digits.length >= 13 ? digits.slice(2) : digits;
  return withoutCountryCode.slice(0, 11);
}

export function isFamilyManagerRole(role: string | undefined) {
  return role === 'OWNER' || role === 'ADMIN';
}

export function familyMemberDisplayName(member: FamilyMemberActionTarget, currentUserId?: string) {
  if (currentUserId && member.user.id === currentUserId) return '我';
  return member.user.displayName?.trim() || '家庭成员';
}

export function canOperateFamilyMember({
  currentRole,
  currentUserId,
  member,
}: {
  currentRole: string | undefined;
  currentUserId: string | undefined;
  member: FamilyMemberActionTarget;
}) {
  if (!isFamilyManagerRole(currentRole)) return false;
  if (!currentUserId || member.user.id === currentUserId) return false;
  return member.role !== 'OWNER';
}

export function nextFamilyMemberRole(role: ManageableFamilyRole) {
  if (role === 'MEMBER') return 'ADMIN';
  if (role === 'ADMIN') return 'MEMBER';
  return null;
}

export function familyMemberRoleChangeCopy(
  name: string,
  role: ManageableFamilyRole,
): FamilyMemberRoleChangeCopy | null {
  const nextRole = nextFamilyMemberRole(role);
  if (!nextRole) return null;
  if (nextRole === 'ADMIN')
    return {
      nextRole,
      title: '设为管理员？',
      message: `${name} 将可以邀请成员、调整角色、移除成员和管理通知设置。`,
      confirmLabel: '设为管理员',
      success: `${name} 已设为管理员。`,
    };
  return {
    nextRole,
    title: '设为普通成员？',
    message: `${name} 将不能再邀请成员、调整角色、移除成员或导出全家庭数据。`,
    confirmLabel: '设为成员',
    success: `${name} 已设为普通成员。`,
  };
}

export function memberOperationKey(kind: MemberOperationKind, memberId: string) {
  return `${kind}:${memberId}` as MemberOperationKey;
}
