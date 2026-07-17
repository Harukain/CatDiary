import { describe, expect, it } from 'vitest';
import familyMembersSource from '../../../app/family/members.tsx?raw';

describe('family members mobile layout', () => {
  it('keeps member page actions fixed and safe-area aware', () => {
    expect(familyMembersSource).toContain('useSafeAreaInsets');
    expect(familyMembersSource).toContain('keyboardShouldPersistTaps="handled"');
    expect(familyMembersSource).toContain('testID="family-members.footer"');
    expect(familyMembersSource).toContain('testID="family-members.invite-submit.button"');
    expect(familyMembersSource).toContain('testID="family-members.reload.button"');
    expect(familyMembersSource).toContain('testID="family-members.return.button"');
    expect(familyMembersSource).toContain(
      'paddingBottom: Math.max(spacing.md, insets.bottom + spacing.sm)',
    );
  });

  it('keeps invite errors from replacing the invite action with reload', () => {
    expect(familyMembersSource).toContain(
      'const listUnavailable = !!error && members.length === 0;',
    );
    expect(familyMembersSource).toContain('const canInvite = canManage && phoneValid');
    expect(familyMembersSource).toContain('error={phoneError}');
    expect(familyMembersSource).toContain('{listUnavailable ? (');
  });

  it('keeps row actions readable on narrow phones', () => {
    expect(familyMembersSource).toContain('styles.memberTop');
    expect(familyMembersSource).toContain('styles.roleAction');
    expect(familyMembersSource).toContain('styles.removeAction');
    expect(familyMembersSource).toContain('numberOfLines={1}');
    expect(familyMembersSource).not.toContain('styles.action,');
    expect(familyMembersSource).not.toContain('actionDisabled');
  });
});
