import { describe, expect, it } from 'vitest';
import familyInviteSource from '../../../app/family-invites/[token].tsx?raw';

describe('family invite route state guards', () => {
  it('does not redirect to login before session restoration finishes', () => {
    expect(familyInviteSource).toContain('const { restoring, session, addFamily } = useSession();');
    expect(familyInviteSource).toContain('testID="family-invite.restoring.card"');
    expect(familyInviteSource.indexOf('if (restoring)')).toBeLessThan(
      familyInviteSource.indexOf('if (!session)'),
    );
    expect(familyInviteSource).toContain('恢复完成后再处理家庭邀请');
  });

  it('shows an explicit invalid-link state before login redirect when token is missing', () => {
    expect(familyInviteSource).toContain(
      'const inviteToken = Array.isArray(token) ? token[0] : token;',
    );
    expect(familyInviteSource).toContain('testID="family-invite.invalid-token.card"');
    expect(familyInviteSource).toContain('testID="family-invite.invalid-token.return.button"');
    expect(familyInviteSource.indexOf('if (!inviteToken)')).toBeLessThan(
      familyInviteSource.indexOf('if (!session)'),
    );
    expect(familyInviteSource).toContain('请让家庭管理员重新发送邀请链接');
  });

  it('preserves the encoded invite link through login and locks accept actions safely', () => {
    expect(familyInviteSource).toContain(
      "const invitePath = inviteToken ? `/family-invites/${encodeURIComponent(inviteToken)}` : '/';",
    );
    expect(familyInviteSource).toContain('params: { next: invitePath }');
    expect(familyInviteSource).toContain('const canAccept = !!session && !!inviteToken && !busy;');
    expect(familyInviteSource).toContain('disabled={!canAccept}');
    expect(familyInviteSource).toContain('disabled={busy}');
  });

  it('surfaces invalid session context instead of relying on non-null assertions', () => {
    expect(familyInviteSource).toContain('if (!session) {');
    expect(familyInviteSource).toContain("setError('登录状态已失效，请重新登录后再试');");
    expect(familyInviteSource).toContain('authApi.acceptInvite(session.accessToken, inviteToken)');
    expect(familyInviteSource).not.toContain('session!');
  });
});
