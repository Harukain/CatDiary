export type NotificationPreferenceKey = 'taskReminderEnabled' | 'pushEnabled' | 'overdueEnabled';

export type NotificationPreferenceState = Record<NotificationPreferenceKey, boolean>;

export function notificationPreferenceLabel(key: NotificationPreferenceKey) {
  return {
    taskReminderEnabled: '照顾任务提醒',
    pushEnabled: '手机推送',
    overdueEnabled: '逾期提醒',
  }[key];
}

export function notificationPreferenceSaveMessage(key: NotificationPreferenceKey, value: boolean) {
  const label = notificationPreferenceLabel(key);
  if (key === 'taskReminderEnabled' && !value)
    return '照顾任务提醒已关闭。手机推送和逾期提醒将暂不触发。';
  return `${label}已${value ? '开启' : '关闭'}。`;
}

export function notificationPreferenceDependencyHint(
  preference: NotificationPreferenceState,
  key: NotificationPreferenceKey,
) {
  if (key === 'taskReminderEnabled') return '';
  return preference.taskReminderEnabled ? '' : '照顾任务提醒关闭时，此项暂不会触发。';
}

export function notificationPreferenceEffectiveEnabled(
  preference: NotificationPreferenceState,
  key: NotificationPreferenceKey,
) {
  if (key === 'taskReminderEnabled') return preference.taskReminderEnabled;
  return preference.taskReminderEnabled && preference[key];
}

export function canEditNotificationPreference({
  savingKey,
  loading,
}: {
  savingKey: NotificationPreferenceKey | '';
  loading: boolean;
}) {
  return !loading && !savingKey;
}
