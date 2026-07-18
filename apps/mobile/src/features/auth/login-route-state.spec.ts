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

  it('guards pre-login legal links with link support checks and failure feedback', () => {
    expect(loginRouteSource).toContain(
      "const [legalOpening, setLegalOpening] = useState<'terms' | 'privacy' | null>(null);",
    );
    expect(loginRouteSource).toContain("const [legalError, setLegalError] = useState('');");
    expect(loginRouteSource).toContain('const canOpenLegalLinks = !busy && !legalOpening;');
    expect(loginRouteSource).toContain(
      "async function openLegalLink(kind: 'terms' | 'privacy', url: string | undefined)",
    );
    expect(loginRouteSource).toContain('Linking.canOpenURL(url)');
    expect(loginRouteSource).toContain('await Linking.openURL(url);');
    expect(loginRouteSource).toContain("kind === 'terms' ? '用户协议打开失败，请稍后重试。'");
    expect(loginRouteSource).toContain('testID="login.legal.error"');
    expect(loginRouteSource).toContain('testID="login.terms.link"');
    expect(loginRouteSource).toContain('testID="login.privacy.link"');
    expect(loginRouteSource).toContain('accessibilityState={{ disabled: !canOpenLegalLinks }}');
    expect(loginRouteSource).toContain('disabled={!canOpenLegalLinks}');
    expect(loginRouteSource).toContain('styles.legalLinkButton');
    expect(loginRouteSource).not.toContain('onPress={() => void Linking.openURL');
  });
});
