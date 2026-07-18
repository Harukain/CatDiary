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
      'const listUnavailable = !restoring && !!error && members.length === 0;',
    );
    expect(familyMembersSource).toMatch(/const canInvite\s*=\s*canManage\s*&&\s*phoneValid/);
    expect(familyMembersSource).toContain('error={phoneError}');
    expect(familyMembersSource).toContain('{listUnavailable ? (');
  });

  it('shows explicit restoring and missing context states before member actions', () => {
    expect(familyMembersSource).toContain(
      'const { restoring, session, activeFamily } = useSession();',
    );
    expect(familyMembersSource).toContain(
      'const contextUnavailable = !restoring && (!session || !activeFamily);',
    );
    expect(familyMembersSource).toContain('if (restoring) return;');
    expect(familyMembersSource).toContain("setError('');");
    expect(familyMembersSource).toContain("setSuccess('');");
    expect(familyMembersSource).toContain("setDevToken('');");
    expect(familyMembersSource).toContain('testID="family-members.loading.card"');
    expect(familyMembersSource).toContain('testID="family-members.context-unavailable.card"');
    expect(familyMembersSource).toContain(
      'disabled={busy || restoring || contextUnavailable || !session || !activeFamily}',
    );
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
