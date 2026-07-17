import { describe, expect, it } from 'vitest';
import notificationSettingsSource from '../../../app/settings/notifications.tsx?raw';

describe('notification settings bottom actions', () => {
  it('keeps current-device push actions fixed and safe-area aware', () => {
    expect(notificationSettingsSource).toContain('useSafeAreaInsets');
    expect(notificationSettingsSource).toContain('keyboardShouldPersistTaps="handled"');
    expect(notificationSettingsSource).toContain('testID="notifications.footer"');
    expect(notificationSettingsSource).toContain('testID="notifications.register-device.button"');
    expect(notificationSettingsSource).toContain('testID="notifications.test-push.button"');
    expect(notificationSettingsSource).toContain('testID="notifications.return.button"');
    expect(notificationSettingsSource).toContain(
      'paddingBottom: Math.max(spacing.md, insets.bottom + spacing.sm)',
    );
  });

  it('uses explicit enabled states for every device-push action', () => {
    expect(notificationSettingsSource).toContain('disabled={devicePushTesting || Boolean(saving)}');
    expect(notificationSettingsSource).toContain('disabled={!canTestDevicePush}');
    expect(notificationSettingsSource).toContain(
      'disabled={Boolean(saving) || devicePushRegistering || devicePushTesting}',
    );
    expect(notificationSettingsSource).toContain('const canTestDevicePush = preference');
    expect(notificationSettingsSource).toContain('const editingDisabled =');
  });
});
