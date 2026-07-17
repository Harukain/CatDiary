import { describe, expect, it } from 'vitest';
import meTabSource from '../../../app/(tabs)/me.tsx?raw';

describe('me tab settings rows', () => {
  it('keeps settings rows as full-width tappable targets', () => {
    expect(meTabSource).toContain('function SettingsRow');
    expect(meTabSource).toContain(
      'style={({ pressed }) => [styles.settingsRow, pressed && styles.pressed]}',
    );
    expect(meTabSource).toContain('accessibilityLabel={`${title}，${body}`}');
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
});
