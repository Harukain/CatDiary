import { describe, expect, it } from 'vitest';
import feishuSettingsSource from '../../../app/settings/feishu.tsx?raw';

describe('feishu settings bottom actions', () => {
  it('keeps manager actions fixed and safe-area aware when the keyboard is hidden', () => {
    expect(feishuSettingsSource).toContain('KeyboardAvoidingView');
    expect(feishuSettingsSource).toContain('Keyboard.addListener');
    expect(feishuSettingsSource).toContain('useSafeAreaInsets');
    expect(feishuSettingsSource).toContain('keyboardShouldPersistTaps="handled"');
    expect(feishuSettingsSource).toContain('testID="feishu.footer"');
    expect(feishuSettingsSource).toContain('testID="feishu.save.button"');
    expect(feishuSettingsSource).toContain('testID="feishu.test.button"');
    expect(feishuSettingsSource).toContain('testID="feishu.remove.button"');
    expect(feishuSettingsSource).toContain('testID="feishu.return.button"');
    expect(feishuSettingsSource).toContain(
      'paddingBottom: Math.max(spacing.md, insets.bottom + spacing.sm)',
    );
  });

  it('keeps inline actions available while editing the webhook and uses real enabled conditions', () => {
    expect(feishuSettingsSource).toContain('testID="feishu.save.inline-button"');
    expect(feishuSettingsSource).toContain('testID="feishu.test.inline-button"');
    expect(feishuSettingsSource).toContain('testID="feishu.remove.inline-button"');
    expect(feishuSettingsSource).toContain('testID="feishu.return.inline-button"');
    expect(feishuSettingsSource).toContain(
      'const canSaveWebhook = canManage && !loading && !busy && draftDirty && !webhookError;',
    );
    expect(feishuSettingsSource).toContain(
      'const canTestWebhook = canManage && !loading && !busy && !!feishuChannel;',
    );
    expect(feishuSettingsSource).toContain(
      'const canRemoveWebhook = canManage && !loading && !busy && !!feishuChannel;',
    );
  });
});
