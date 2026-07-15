import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  BackHandler,
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
import { authApi, type NotificationPreference } from '../../src/features/auth/auth-api';
import { useSession } from '../../src/features/auth/session-provider';
import {
  canEditNotificationPreference,
  notificationPreferenceDependencyHint,
  notificationPreferenceEffectiveEnabled,
  notificationPreferenceSaveMessage,
  type NotificationPreferenceKey,
} from '../../src/features/notifications/notification-preferences';
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
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
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
    if (!saving) {
      router.back();
      return;
    }
    Alert.alert('通知设置正在保存', '请等待当前开关保存完成，避免本机展示状态与服务器不一致。', [
      { text: '继续等待', style: 'cancel' },
    ]);
  }, [router, saving]);
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!saving) return false;
      requestReturn();
      return true;
    });
    return () => subscription.remove();
  }, [requestReturn, saving]);
  async function change(key: NotificationPreferenceKey, value: boolean) {
    if (!session || !activeFamily || !preference) return;
    if (!canEditNotificationPreference({ loading, savingKey: saving })) return;
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
              disabled={!canEditNotificationPreference({ loading, savingKey: saving })}
              saving={saving === 'taskReminderEnabled'}
              onChange={(value) => void change('taskReminderEnabled', value)}
            />
            <Setting
              title="手机推送"
              detail="允许服务器向当前账号已登记的设备发送通知"
              value={preference.pushEnabled}
              effectiveEnabled={notificationPreferenceEffectiveEnabled(preference, 'pushEnabled')}
              disabled={!canEditNotificationPreference({ loading, savingKey: saving })}
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
              disabled={!canEditNotificationPreference({ loading, savingKey: saving })}
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
