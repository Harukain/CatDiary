import { describe, expect, it } from 'vitest';
import {
  canEditNotificationPreference,
  devicePushRegistrationActionLabel,
  devicePushRegistrationBody,
  devicePushRegistrationFailureRecovery,
  devicePushRegistrationTitle,
  maskExpoPushToken,
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
    expect(notificationPreferenceSaveMessage('pushEnabled', true)).toBe(
      '手机推送已开启。这台设备已完成注册。',
    );
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

  it('keeps device push registration copy explicit and token-safe', () => {
    const token = 'abcdefghijklmnopqrstuvwxyz';

    expect(maskExpoPushToken(token)).toBe('abcdefghijklmn…uvwxyz');
    expect(devicePushRegistrationTitle('idle')).toBe('当前设备待确认');
    expect(devicePushRegistrationTitle('registered')).toBe('当前设备已登记');
    expect(devicePushRegistrationBody({ status: 'idle' })).toContain('重新登记当前设备');
    expect(
      devicePushRegistrationBody({
        status: 'registered',
        maskedToken: maskExpoPushToken(token),
      }),
    ).toContain('abcdefghijklmn…uvwxyz');
    expect(devicePushRegistrationBody({ status: 'failed' })).toContain('失败原因');
    expect(devicePushRegistrationActionLabel('idle')).toBe('登记当前设备');
    expect(devicePushRegistrationActionLabel('registered')).toBe('重新登记当前设备');
    expect(devicePushRegistrationActionLabel('registering')).toBe('登记中');
  });

  it('offers system settings recovery only for notification permission failures', () => {
    expect(devicePushRegistrationFailureRecovery('未获得通知权限，可稍后在系统设置中开启')).toEqual(
      {
        title: '系统通知权限未开启',
        body: '请在系统设置中允许猫伴日记发送通知，然后返回这里重新登记当前设备。',
        actionLabel: '打开系统设置',
      },
    );
    expect(devicePushRegistrationFailureRecovery('Network request failed')).toBeNull();
  });
});
