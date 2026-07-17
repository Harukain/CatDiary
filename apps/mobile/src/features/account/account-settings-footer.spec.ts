import { describe, expect, it } from 'vitest';
import accountSettingsSource from '../../../app/settings/account.tsx?raw';

describe('account settings bottom actions', () => {
  it('keeps account danger actions fixed and safe-area aware when the keyboard is hidden', () => {
    expect(accountSettingsSource).toContain('KeyboardAvoidingView');
    expect(accountSettingsSource).toContain('Keyboard.addListener');
    expect(accountSettingsSource).toContain('useSafeAreaInsets');
    expect(accountSettingsSource).toContain('keyboardShouldPersistTaps="handled"');
    expect(accountSettingsSource).toContain('testID="account.footer"');
    expect(accountSettingsSource).toContain('testID="account.pending-footer"');
    expect(accountSettingsSource).toContain('testID="account.request-delete.button"');
    expect(accountSettingsSource).toContain('testID="account.logout-all.button"');
    expect(accountSettingsSource).toContain('testID="account.cancel-deletion.button"');
    expect(accountSettingsSource).toContain('testID="account.return.button"');
    expect(accountSettingsSource).toContain(
      'paddingBottom: Math.max(spacing.md, insets.bottom + spacing.sm)',
    );
  });

  it('keeps inline delete/return actions available while entering the code and uses real guards', () => {
    expect(accountSettingsSource).toContain('testID="account.deletion-code.input"');
    expect(accountSettingsSource).toContain('testID="account.send-code.button"');
    expect(accountSettingsSource).toContain('testID="account.request-delete.inline-button"');
    expect(accountSettingsSource).toContain('testID="account.return.inline-button"');
    expect(accountSettingsSource).toContain(
      'const deletionCodeReady = sanitizeDeletionCode(code).length === 6;',
    );
    expect(accountSettingsSource).toContain('disabled={busy || !deletionCodeReady}');
    expect(accountSettingsSource).toContain("Alert.alert('账号操作正在处理'");
  });
});
