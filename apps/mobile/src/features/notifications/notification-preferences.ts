export type NotificationPreferenceKey = 'taskReminderEnabled' | 'pushEnabled' | 'overdueEnabled';

export type NotificationPreferenceState = Record<NotificationPreferenceKey, boolean>;
export type DevicePushRegistrationStatus = 'idle' | 'registering' | 'registered' | 'failed';

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
  if (key === 'pushEnabled' && value) return '手机推送已开启。这台设备已完成注册。';
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

export function maskExpoPushToken(token: string) {
  const trimmed = token.trim();
  if (!trimmed) return '';
  if (trimmed.length <= 20) return '已登记';
  return `${trimmed.slice(0, 14)}…${trimmed.slice(-6)}`;
}

export function devicePushRegistrationTitle(status: DevicePushRegistrationStatus) {
  return {
    idle: '当前设备待确认',
    registering: '正在登记当前设备',
    registered: '当前设备已登记',
    failed: '当前设备登记失败',
  }[status];
}

export function devicePushRegistrationBody({
  status,
  maskedToken,
}: {
  status: DevicePushRegistrationStatus;
  maskedToken?: string;
}) {
  switch (status) {
    case 'registering':
      return '正在申请系统通知权限并向服务器登记 Expo Push Token。';
    case 'registered':
      return maskedToken
        ? `这台设备已登记为 ${maskedToken}，可接收已开启的照顾提醒。`
        : '这台设备已登记，可接收已开启的照顾提醒。';
    case 'failed':
      return '这台设备暂时不能接收系统推送，请按失败原因处理后重试。';
    default:
      return '如果刚换手机、重装 App 或系统权限曾被关闭，请重新登记当前设备。';
  }
}

export function devicePushRegistrationActionLabel(status: DevicePushRegistrationStatus) {
  if (status === 'registering') return '登记中';
  if (status === 'registered') return '重新登记当前设备';
  return '登记当前设备';
}

export function devicePushRegistrationFailureRecovery(errorMessage: string) {
  const message = errorMessage.trim();
  if (!/权限|permission/i.test(message)) return null;
  return {
    title: '系统通知权限未开启',
    body: '请在系统设置中允许猫伴日记发送通知，然后返回这里重新登记当前设备。',
    actionLabel: '打开系统设置',
  };
}
