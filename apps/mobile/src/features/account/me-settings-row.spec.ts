import { describe, expect, it } from 'vitest';
import meTabSource from '../../../app/(tabs)/me.tsx?raw';

describe('me tab settings rows', () => {
  it('keeps settings rows as full-width tappable targets', () => {
    expect(meTabSource).toContain('function SettingsRow');
    expect(meTabSource).toContain('styles.settingsRow');
    expect(meTabSource).toContain('disabled && styles.disabled');
    expect(meTabSource).toContain('pressed && styles.pressed');
    expect(meTabSource).toContain('accessibilityLabel={`${title}，${body}`}');
    expect(meTabSource).toContain('accessibilityState={{ disabled: !!disabled }}');
    expect(meTabSource).toContain('disabled={disabled}');
    expect(meTabSource).not.toContain('<Row');
  });

  it('keeps all primary settings destinations addressable for acceptance flows', () => {
    expect(meTabSource).toContain('testID="me.pets.button"');
    expect(meTabSource).toContain('testID="me.family-members.button"');
    expect(meTabSource).toContain('testID="me.notifications.button"');
    expect(meTabSource).toContain('testID="me.notification-logs.button"');
    expect(meTabSource).toContain('testID="me.export.button"');
    expect(meTabSource).toContain('testID="me.account.button"');
  });

  it('renders explicit restoring and missing-context states', () => {
    expect(meTabSource).toContain(
      'const { restoring, session, activeFamily, selectFamily, signOut } = useSession();',
    );
    expect(meTabSource).toContain(
      'const contextUnavailable = !restoring && (!session || !activeFamily);',
    );
    expect(meTabSource).toContain('testID="me.restoring.card"');
    expect(meTabSource).toContain('正在恢复账号与家庭信息…');
    expect(meTabSource).toContain('testID="me.context-empty.card"');
    expect(meTabSource).toContain("router.push('/onboarding/family')");
    expect(meTabSource).toContain('testID="me.settings-lock-note"');
  });

  it('locks family-scoped destinations until an active family exists', () => {
    expect(meTabSource).toContain(
      'const familyScopedLocked = restoring || signingOut || !session || !activeFamily;',
    );
    expect(meTabSource).toContain(
      'const sessionScopedLocked = restoring || signingOut || !session;',
    );
    expect(
      meTabSource.match(/disabled=\{familyScopedLocked\}/g)?.length ?? 0,
    ).toBeGreaterThanOrEqual(7);
    expect(
      meTabSource.match(/disabled=\{sessionScopedLocked\}/g)?.length ?? 0,
    ).toBeGreaterThanOrEqual(3);
    expect(meTabSource).toContain('disabled && styles.disabled');
    expect(meTabSource).toContain('disabled && styles.rowMuted');
  });

  it('keeps family switching usable as the path out of a missing active family', () => {
    expect(meTabSource).toContain(
      'const familySwitchLocked = restoring || signingOut || !session;',
    );
    expect(meTabSource).toContain('testID="me.family-select.hint"');
    expect(meTabSource).toContain('disabled={familySwitchLocked}');
    expect(meTabSource).toContain('onPress={() => selectFamily(family)}');
  });

  it('guards sign-out against duplicate execution and exposes failure feedback', () => {
    expect(meTabSource).toContain('const [signingOut, setSigningOut] = useState(false);');
    expect(meTabSource).toContain('if (restoring || signingOut || !session) return;');
    expect(meTabSource).toContain("label={signingOut ? '正在退出…' : '退出登录'}");
    expect(meTabSource).toContain('testID="me.sign-out.error"');
    expect(meTabSource).toContain("setSignOutError('退出失败，请稍后重试。');");
  });
});
