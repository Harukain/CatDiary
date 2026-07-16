import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { Stack, useRouter, type Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, radii, spacing, typography } from '@cat-diary/design-tokens';
import {
  AuthApiError,
  authApi,
  type NotificationPreference,
} from '../../src/features/auth/auth-api';
import { useSession } from '../../src/features/auth/session-provider';
import {
  canEditNotificationPreference,
  canSendDevicePushTest,
  devicePushRegistrationActionLabel,
  devicePushRegistrationBody,
  devicePushRegistrationFailureRecovery,
  devicePushRegistrationTitle,
  devicePushTestActionLabel,
  devicePushTestHint,
  maskExpoPushToken,
  notificationPreferenceDependencyHint,
  notificationPreferenceEffectiveEnabled,
  notificationPreferenceSaveMessage,
  type DevicePushRegistrationStatus,
  type DevicePushTestStatus,
  type NotificationPreferenceKey,
} from '../../src/features/notifications/notification-preferences';
import { registerForPushNotifications } from '../../src/features/notifications/register-push';
import {
  Body,
  Card,
  ErrorText,
  Screen,
  SuccessText,
  TextButton,
  Title,
} from '../../src/shared/ui/primitives';

export default function NotificationSettingsRoute() {
  const router = useRouter();
  const { session, activeFamily } = useSession();
  const [preference, setPreference] = useState<NotificationPreference>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<NotificationPreferenceKey | ''>('');
  const [devicePushStatus, setDevicePushStatus] = useState<DevicePushRegistrationStatus>('idle');
  const [devicePushTestStatus, setDevicePushTestStatus] = useState<DevicePushTestStatus>('idle');
  const [devicePushToken, setDevicePushToken] = useState('');
  const [devicePushError, setDevicePushError] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const devicePushRegistering = devicePushStatus === 'registering';
  const devicePushTesting = devicePushTestStatus === 'sending';
  const editingDisabled =
    !canEditNotificationPreference({ loading, savingKey: saving }) ||
    devicePushRegistering ||
    devicePushTesting;
  const devicePushRecovery = devicePushError
    ? devicePushRegistrationFailureRecovery(devicePushError)
    : null;
  const canTestDevicePush = preference
    ? canSendDevicePushTest({
        loading,
        savingKey: saving,
        pushEnabled: preference.pushEnabled,
        registrationStatus: devicePushStatus,
        testStatus: devicePushTestStatus,
      })
    : false;
  const devicePushTestHelp = preference
    ? devicePushTestHint({
        pushEnabled: preference.pushEnabled,
        registrationStatus: devicePushStatus,
      })
    : '';
  const load = useCallback(async () => {
    if (!session || !activeFamily) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    setSuccess('');
    try {
      setPreference(await authApi.getNotificationPreference(session.accessToken, activeFamily.id));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '通知设置加载失败');
    } finally {
      setLoading(false);
    }
  }, [activeFamily, session]);
  useEffect(() => {
    void load();
  }, [load]);
  const requestReturn = useCallback(() => {
    if (!saving && !devicePushRegistering && !devicePushTesting) {
      router.back();
      return;
    }
    Alert.alert(
      '通知设置正在处理',
      '请等待当前保存、登记或测试发送完成，避免本机展示状态与服务器不一致。',
      [{ text: '继续等待', style: 'cancel' }],
    );
  }, [devicePushRegistering, devicePushTesting, router, saving]);
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!saving && !devicePushRegistering && !devicePushTesting) return false;
      requestReturn();
      return true;
    });
    return () => subscription.remove();
  }, [devicePushRegistering, devicePushTesting, requestReturn, saving]);
  async function change(key: NotificationPreferenceKey, value: boolean) {
    if (!session || !activeFamily || !preference) return;
    if (editingDisabled) return;
    if (key === 'pushEnabled' && value) {
      const registered = await registerCurrentDevicePush(false);
      if (!registered) return;
    }
    const previous = preference;
    setPreference({ ...preference, [key]: value });
    setSaving(key);
    setError('');
    setSuccess('');
    try {
      setPreference(
        await authApi.updateNotificationPreference(session.accessToken, activeFamily.id, {
          [key]: value,
        }),
      );
      setSuccess(notificationPreferenceSaveMessage(key, value));
    } catch (cause) {
      setPreference(previous);
      setError(cause instanceof Error ? cause.message : '保存失败');
    } finally {
      setSaving('');
    }
  }
  async function registerCurrentDevicePush(showSuccess = true) {
    if (!session || devicePushStatus === 'registering') return false;
    setDevicePushStatus('registering');
    setDevicePushToken('');
    setDevicePushError('');
    setDevicePushTestStatus('idle');
    setError('');
    if (showSuccess) setSuccess('');
    try {
      const token = await registerForPushNotifications(session.accessToken);
      setDevicePushToken(token);
      setDevicePushStatus('registered');
      if (showSuccess) setSuccess('当前设备已登记，可接收已开启的照顾提醒。');
      return true;
    } catch (cause) {
      setDevicePushStatus('failed');
      setDevicePushError(cause instanceof Error ? cause.message : '当前设备推送登记失败');
      return false;
    }
  }
  async function sendCurrentDevicePushTest() {
    if (!session || !activeFamily || !preference || !canTestDevicePush) return;
    setDevicePushTestStatus('sending');
    setDevicePushError('');
    setError('');
    setSuccess('');
    try {
      const result = await authApi.testCurrentDevicePush(session.accessToken, activeFamily.id);
      setDevicePushTestStatus('sent');
      setSuccess(
        result.providerMessageId
          ? `测试推送已发送，票据 ${result.providerMessageId}。请在这台手机上确认是否收到。`
          : '测试推送已发送。请在这台手机上确认是否收到。',
      );
    } catch (cause) {
      setDevicePushTestStatus('failed');
      if (
        cause instanceof AuthApiError &&
        (cause.code === 'CURRENT_DEVICE_PUSH_TOKEN_MISSING' ||
          cause.code === 'PUSH_TOKEN_NOT_DELIVERABLE')
      ) {
        setDevicePushStatus('failed');
      }
      setDevicePushError(cause instanceof Error ? cause.message : '测试推送发送失败');
    }
  }
  async function openDevicePushSettings() {
    try {
      await Linking.openSettings();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : '无法打开系统设置，请手动前往设置开启通知权限。',
      );
    }
  }
  return (
    <Screen>
      <Stack.Screen options={{ gestureEnabled: false }} />
      <View style={styles.nav}>
        <Pressable
          accessibilityLabel="返回"
          accessibilityHint={saving ? '通知设置保存中，点击会提示继续等待' : '返回上一页'}
          onPress={requestReturn}
          style={({ pressed }) => [styles.back, pressed && styles.pressed]}
        >
          <Ionicons name="chevron-back" size={22} color={colors.ink} />
        </Pressable>
        <Text style={styles.navTitle}>通知偏好</Text>
        <View style={styles.back} />
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <View>
          <Text style={styles.title}>由你决定何时提醒</Text>
          <Text style={styles.subtitle}>设置仅影响你本人，不会停止家庭任务生成。</Text>
        </View>
        {loading ? (
          <View style={styles.loading}>
            <ActivityIndicator color={colors.brand} />
            <Text style={styles.loadingText}>正在加载通知设置…</Text>
          </View>
        ) : preference ? (
          <Card>
            <Title>{activeFamily?.name}</Title>
            {success ? <SuccessText>{success}</SuccessText> : null}
            {error ? <ErrorText>{error}</ErrorText> : null}
            <Setting
              title="照顾任务提醒"
              detail="接收疫苗、驱虫、用药和铲屎等计划提醒"
              value={preference.taskReminderEnabled}
              effectiveEnabled={notificationPreferenceEffectiveEnabled(
                preference,
                'taskReminderEnabled',
              )}
              disabled={editingDisabled}
              saving={saving === 'taskReminderEnabled'}
              onChange={(value) => void change('taskReminderEnabled', value)}
            />
            <Setting
              title="手机推送"
              detail="开启前会先申请系统通知权限并登记当前设备"
              value={preference.pushEnabled}
              effectiveEnabled={notificationPreferenceEffectiveEnabled(preference, 'pushEnabled')}
              disabled={editingDisabled}
              saving={saving === 'pushEnabled'}
              hint={notificationPreferenceDependencyHint(preference, 'pushEnabled')}
              onChange={(value) => void change('pushEnabled', value)}
            />
            <Setting
              title="逾期提醒"
              detail="任务超过计划时间后继续提醒你处理"
              value={preference.overdueEnabled}
              effectiveEnabled={notificationPreferenceEffectiveEnabled(
                preference,
                'overdueEnabled',
              )}
              disabled={editingDisabled}
              saving={saving === 'overdueEnabled'}
              hint={notificationPreferenceDependencyHint(preference, 'overdueEnabled')}
              onChange={(value) => void change('overdueEnabled', value)}
            />
          </Card>
        ) : error ? (
          <Card>
            <Title>通知设置加载失败</Title>
            <ErrorText>{error}</ErrorText>
            <TextButton label="重新加载" onPress={() => void load()} />
          </Card>
        ) : null}
        {preference ? (
          <Card>
            <Title>当前设备推送</Title>
            <View style={styles.devicePushHeader}>
              <View
                style={[
                  styles.statusDot,
                  devicePushStatus === 'registered'
                    ? styles.statusDotSuccess
                    : devicePushStatus === 'failed'
                      ? styles.statusDotDanger
                      : styles.statusDotWarn,
                ]}
              />
              <View style={styles.devicePushCopy}>
                <Text style={styles.devicePushTitle}>
                  {devicePushRegistrationTitle(devicePushStatus)}
                </Text>
                <Text style={styles.devicePushBody}>
                  {devicePushRegistrationBody({
                    status: devicePushStatus,
                    maskedToken: maskExpoPushToken(devicePushToken),
                  })}
                </Text>
              </View>
            </View>
            {devicePushError ? <ErrorText>{devicePushError}</ErrorText> : null}
            {devicePushRecovery ? (
              <View style={styles.devicePushRecovery}>
                <Ionicons name="alert-circle-outline" size={18} color={colors.dangerDark} />
                <View style={styles.devicePushRecoveryBody}>
                  <Text style={styles.devicePushRecoveryTitle}>{devicePushRecovery.title}</Text>
                  <Text style={styles.devicePushRecoveryText}>{devicePushRecovery.body}</Text>
                  <TextButton
                    label={devicePushRecovery.actionLabel}
                    danger
                    disabled={devicePushRegistering || devicePushTesting || Boolean(saving)}
                    onPress={() => void openDevicePushSettings()}
                  />
                </View>
              </View>
            ) : null}
            {!preference.pushEnabled ? (
              <Text style={styles.settingHint}>
                当前个人偏好里的“手机推送”是关闭状态；登记设备不会改变任务生成。
              </Text>
            ) : null}
            <TextButton
              label={devicePushRegistrationActionLabel(devicePushStatus)}
              disabled={devicePushRegistering || devicePushTesting || Boolean(saving)}
              onPress={() => void registerCurrentDevicePush()}
            />
            <View style={styles.devicePushTest}>
              <TextButton
                label={devicePushTestActionLabel(devicePushTestStatus)}
                disabled={!canTestDevicePush}
                onPress={() => void sendCurrentDevicePushTest()}
              />
              <Text style={styles.devicePushTestHint}>{devicePushTestHelp}</Text>
            </View>
          </Card>
        ) : null}
        <Card>
          <Title>家庭通知渠道</Title>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="飞书通知"
            accessibilityHint="配置家庭级飞书机器人通知"
            onPress={() => router.push('/settings/feishu' as Href)}
            style={({ pressed }) => [styles.channelRow, pressed && styles.pressed]}
          >
            <View style={styles.channelIcon}>
              <Ionicons name="chatbubble-ellipses-outline" size={20} color={colors.brand} />
            </View>
            <View style={styles.channelBody}>
              <Text style={styles.channelTitle}>飞书群机器人</Text>
              <Text style={styles.channelDetail}>
                管理员配置 Webhook 后，家庭任务可同步到飞书群。
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
          </Pressable>
        </Card>
        <View style={styles.notice}>
          <Ionicons name="information-circle-outline" size={20} color={colors.brand} />
          <Body>关闭通知不会删除任务；你仍然可以在“任务”页面查看和完成它们。</Body>
        </View>
      </ScrollView>
    </Screen>
  );
}
function Setting({
  title,
  detail,
  value,
  effectiveEnabled,
  disabled,
  saving,
  hint,
  onChange,
}: {
  title: string;
  detail: string;
  value: boolean;
  effectiveEnabled: boolean;
  disabled: boolean;
  saving: boolean;
  hint?: string;
  onChange(value: boolean): void;
}) {
  return (
    <View style={styles.setting}>
      <View style={styles.settingBody}>
        <Text style={styles.settingTitle}>{title}</Text>
        <Text style={styles.settingDetail}>{detail}</Text>
        {hint ? <Text style={styles.settingHint}>{hint}</Text> : null}
        {saving ? <Text style={styles.savingText}>保存中…</Text> : null}
      </View>
      <View style={styles.switchWrap}>
        {saving ? <ActivityIndicator color={colors.brand} /> : null}
        <Switch
          accessibilityLabel={title}
          accessibilityHint={hint || undefined}
          accessibilityState={{ disabled, checked: value }}
          disabled={disabled}
          value={value}
          onValueChange={onChange}
          trackColor={{ false: colors.divider, true: colors.brandSoft }}
          thumbColor={effectiveEnabled ? colors.brand : colors.textTertiary}
        />
      </View>
    </View>
  );
}
const styles = StyleSheet.create({
  nav: { height: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  back: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  navTitle: { ...typography.h3, color: colors.ink },
  content: { gap: spacing.xl, paddingBottom: 104 },
  title: { ...typography.h1, color: colors.ink },
  subtitle: { ...typography.secondary, color: colors.textSecondary, marginTop: spacing.xs },
  loading: { minHeight: 120, alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  loadingText: { ...typography.caption, color: colors.textSecondary },
  setting: {
    minHeight: 84,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  settingBody: { flex: 1, gap: spacing.xs },
  settingTitle: { ...typography.h3, color: colors.ink },
  settingDetail: { ...typography.caption, color: colors.textSecondary },
  settingHint: { ...typography.caption, color: colors.warningDark },
  savingText: { ...typography.caption, color: colors.brand },
  devicePushHeader: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginTop: spacing.sm,
  },
  statusDotSuccess: { backgroundColor: colors.success },
  statusDotWarn: { backgroundColor: colors.warning },
  statusDotDanger: { backgroundColor: colors.danger },
  devicePushCopy: { flex: 1, gap: spacing.xs },
  devicePushTitle: { ...typography.h3, color: colors.ink },
  devicePushBody: { ...typography.caption, color: colors.textSecondary, lineHeight: 19 },
  devicePushRecovery: {
    borderRadius: radii.input,
    backgroundColor: colors.dangerSoft,
    padding: spacing.md,
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'flex-start',
  },
  devicePushRecoveryBody: { flex: 1, gap: spacing.xs },
  devicePushRecoveryTitle: { ...typography.h3, color: colors.dangerDark },
  devicePushRecoveryText: { ...typography.caption, color: colors.dangerDark },
  devicePushTest: { gap: spacing.xs },
  devicePushTestHint: { ...typography.caption, color: colors.textSecondary, lineHeight: 18 },
  channelRow: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  channelIcon: {
    width: 44,
    height: 44,
    borderRadius: radii.input,
    backgroundColor: colors.brandSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  channelBody: { flex: 1, gap: spacing.xs },
  channelTitle: { ...typography.h3, color: colors.ink },
  channelDetail: { ...typography.caption, color: colors.textSecondary },
  switchWrap: {
    minWidth: 72,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  notice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    padding: spacing.lg,
    backgroundColor: colors.brandSoft,
    borderRadius: radii.input,
  },
  pressed: { opacity: 0.72, transform: [{ scale: 0.97 }] },
});
