import { describe, expect, it } from 'vitest';
import notificationSettingsSource from '../../../app/settings/notifications.tsx?raw';

describe('notification settings bottom actions', () => {
  it('keeps current-device push actions fixed and safe-area aware', () => {
    expect(notificationSettingsSource).toContain('useSafeAreaInsets');
    expect(notificationSettingsSource).toContain('keyboardShouldPersistTaps="handled"');
    expect(notificationSettingsSource).toContain('testID="notifications.footer"');
    expect(notificationSettingsSource).toContain('testID="notifications.register-device.button"');
    expect(notificationSettingsSource).toContain('testID="notifications.test-push.button"');
    expect(notificationSettingsSource).toContain('testID="notifications.open-settings.button"');
    expect(notificationSettingsSource).toContain('testID="notifications.return.button"');
    expect(notificationSettingsSource).toContain(
      'paddingBottom: Math.max(spacing.md, insets.bottom + spacing.sm)',
    );
  });

  it('uses explicit enabled states for every device-push action', () => {
    expect(notificationSettingsSource).toContain('disabled={devicePushTesting || Boolean(saving)}');
    expect(notificationSettingsSource).toContain('disabled={!canTestDevicePush}');
    expect(notificationSettingsSource).toContain('disabled={returnLocked}');
    expect(notificationSettingsSource).toContain('const returnLocked =');
    expect(notificationSettingsSource).toContain(
      'Boolean(saving) || devicePushRegistering || devicePushTesting || openingSystemSettings',
    );
    expect(notificationSettingsSource).toContain('const canTestDevicePush = preference');
    expect(notificationSettingsSource).toContain('const editingDisabled =');
  });

  it('guards system settings recovery against duplicate opens and unsafe returns', () => {
    expect(notificationSettingsSource).toContain(
      'const [openingSystemSettings, setOpeningSystemSettings] = useState(false);',
    );
    expect(notificationSettingsSource).toContain('if (openingSystemSettings) return;');
    expect(notificationSettingsSource).toContain('setOpeningSystemSettings(true);');
    expect(notificationSettingsSource).toContain('await Linking.openSettings();');
    expect(notificationSettingsSource).toContain('setOpeningSystemSettings(false);');
    expect(notificationSettingsSource).toContain("openingSystemSettings ? '正在打开系统设置'");
    expect(notificationSettingsSource).toContain(
      '请等待当前保存、登记、测试发送或系统设置打开操作完成',
    );
  });
});
