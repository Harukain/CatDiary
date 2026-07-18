import { describe, expect, it } from 'vitest';
import loginRouteSource from '../../../app/(auth)/login.tsx?raw';

describe('login route state guards', () => {
  it('shows a restoration state instead of an editable login form while restoring session', () => {
    expect(loginRouteSource).toContain('const { restoring, session, signIn } = useSession();');
    expect(loginRouteSource).toContain('testID="login.restoring.card"');
    expect(loginRouteSource.indexOf('if (restoring)')).toBeLessThan(
      loginRouteSource.indexOf('if (session)'),
    );
    expect(loginRouteSource).toContain('避免重复发送验证码或覆盖当前会话');
  });

  it('uses a single sanitized redirect target for restored and verified sessions', () => {
    expect(loginRouteSource).toContain('const redirectAfterLogin = resolveLoginRedirect(next);');
    expect(loginRouteSource).toContain(
      'if (session) return <Redirect href={redirectAfterLogin} />;',
    );
    expect(loginRouteSource).toContain('router.replace(redirectAfterLogin);');
    expect(loginRouteSource).not.toContain("next?.startsWith('/family-invites/')");
  });

  it('locks send, verify, change-phone, and resend actions from stale or busy states', () => {
    expect(loginRouteSource).toContain(
      'const canSendCode = !restoring && !session && phoneValid && !busy;',
    );
    expect(loginRouteSource).toContain(
      'const canVerify = !restoring && !session && phoneValid && codeValid && !busy;',
    );
    expect(loginRouteSource).toContain('const canChangePhone = !busy;');
    expect(loginRouteSource).toContain('const canResendCode = canSendCode && cooldown === 0;');
    expect(loginRouteSource).toContain("disabled={step === 'phone' ? !canSendCode : !canVerify}");
    expect(loginRouteSource).toContain('disabled={!canChangePhone}');
    expect(loginRouteSource).toContain('disabled={!canResendCode}');
  });

  it('clears stale verification code when phone number changes', () => {
    expect(loginRouteSource).toContain("if (step === 'phone') {");
    expect(loginRouteSource).toContain("setPhone(value.replace(/\\D/g, ''));");
    expect(loginRouteSource).toContain("setCode('');");
  });
});
