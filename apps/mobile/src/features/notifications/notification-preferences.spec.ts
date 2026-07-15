import { describe, expect, it } from 'vitest';
import {
  canEditNotificationPreference,
  notificationPreferenceDependencyHint,
  notificationPreferenceEffectiveEnabled,
  notificationPreferenceSaveMessage,
  type NotificationPreferenceState,
} from './notification-preferences';

const enabled: NotificationPreferenceState = {
  taskReminderEnabled: true,
  pushEnabled: true,
  overdueEnabled: true,
};

describe('notification preference rules', () => {
  it('explains saved preference changes with concrete copy', () => {
    expect(notificationPreferenceSaveMessage('pushEnabled', false)).toBe('手机推送已关闭。');
    expect(notificationPreferenceSaveMessage('overdueEnabled', true)).toBe('逾期提醒已开启。');
    expect(notificationPreferenceSaveMessage('taskReminderEnabled', false)).toContain(
      '手机推送和逾期提醒将暂不触发',
    );
  });

  it('shows dependency hints when the master reminder switch is off', () => {
    const disabled = { ...enabled, taskReminderEnabled: false };

    expect(notificationPreferenceDependencyHint(disabled, 'pushEnabled')).toContain('暂不会触发');
    expect(notificationPreferenceDependencyHint(disabled, 'overdueEnabled')).toContain(
      '暂不会触发',
    );
    expect(notificationPreferenceDependencyHint(disabled, 'taskReminderEnabled')).toBe('');
    expect(notificationPreferenceDependencyHint(enabled, 'pushEnabled')).toBe('');
  });

  it('derives the effective enabled state from the master reminder switch', () => {
    const disabled = { ...enabled, taskReminderEnabled: false };

    expect(notificationPreferenceEffectiveEnabled(enabled, 'pushEnabled')).toBe(true);
    expect(notificationPreferenceEffectiveEnabled(disabled, 'pushEnabled')).toBe(false);
    expect(notificationPreferenceEffectiveEnabled(disabled, 'taskReminderEnabled')).toBe(false);
  });

  it('blocks edits while loading or saving another preference', () => {
    expect(canEditNotificationPreference({ loading: false, savingKey: '' })).toBe(true);
    expect(canEditNotificationPreference({ loading: true, savingKey: '' })).toBe(false);
    expect(canEditNotificationPreference({ loading: false, savingKey: 'pushEnabled' })).toBe(false);
  });
});
