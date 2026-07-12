import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, radii, spacing, typography } from '@cat-diary/design-tokens';
import { authApi, type NotificationPreference } from '../../src/features/auth/auth-api';
import { useSession } from '../../src/features/auth/session-provider';
import { Body, Card, ErrorText, Screen, Title } from '../../src/shared/ui/primitives';

export default function NotificationSettingsRoute() {
  const router = useRouter();
  const { session, activeFamily } = useSession();
  const [preference, setPreference] = useState<NotificationPreference>();
  const [saving, setSaving] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    if (session && activeFamily)
      void authApi
        .getNotificationPreference(session.accessToken, activeFamily.id)
        .then(setPreference)
        .catch((cause) => setError(cause instanceof Error ? cause.message : '通知设置加载失败'));
  }, [activeFamily, session]);
  async function change(
    key: 'taskReminderEnabled' | 'pushEnabled' | 'overdueEnabled',
    value: boolean,
  ) {
    if (!session || !activeFamily || !preference) return;
    const previous = preference;
    setPreference({ ...preference, [key]: value });
    setSaving(key);
    setError('');
    try {
      setPreference(
        await authApi.updateNotificationPreference(session.accessToken, activeFamily.id, {
          [key]: value,
        }),
      );
    } catch (cause) {
      setPreference(previous);
      setError(cause instanceof Error ? cause.message : '保存失败');
    } finally {
      setSaving('');
    }
  }
  return (
    <Screen>
      <View style={styles.nav}>
        <Pressable accessibilityLabel="返回" onPress={() => router.back()} style={styles.back}>
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
        {!preference && !error ? (
          <ActivityIndicator color={colors.brand} />
        ) : preference ? (
          <Card>
            <Title>{activeFamily?.name}</Title>
            <Setting
              title="照顾任务提醒"
              detail="接收疫苗、驱虫、用药和铲屎等计划提醒"
              value={preference.taskReminderEnabled}
              disabled={!!saving}
              onChange={(value) => void change('taskReminderEnabled', value)}
            />
            <Setting
              title="手机推送"
              detail="允许服务器向当前账号已登记的设备发送通知"
              value={preference.pushEnabled}
              disabled={!!saving}
              onChange={(value) => void change('pushEnabled', value)}
            />
            <Setting
              title="逾期提醒"
              detail="任务超过计划时间后继续提醒你处理"
              value={preference.overdueEnabled}
              disabled={!!saving}
              onChange={(value) => void change('overdueEnabled', value)}
            />
          </Card>
        ) : null}
        {error ? <ErrorText>{error}</ErrorText> : null}
        <View style={styles.notice}>
          <Ionicons name="information-circle-outline" size={20} color={colors.brand} />
          <Body>关闭通知不会删除任务；你仍然可以在“照顾”页面查看和完成它们。</Body>
        </View>
      </ScrollView>
    </Screen>
  );
}
function Setting({
  title,
  detail,
  value,
  disabled,
  onChange,
}: {
  title: string;
  detail: string;
  value: boolean;
  disabled: boolean;
  onChange(value: boolean): void;
}) {
  return (
    <View style={styles.setting}>
      <View style={styles.settingBody}>
        <Text style={styles.settingTitle}>{title}</Text>
        <Text style={styles.settingDetail}>{detail}</Text>
      </View>
      <Switch
        accessibilityLabel={title}
        disabled={disabled}
        value={value}
        onValueChange={onChange}
        trackColor={{ false: colors.divider, true: colors.brandSoft }}
        thumbColor={value ? colors.brand : colors.textTertiary}
      />
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
  setting: {
    minHeight: 76,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  settingBody: { flex: 1, gap: spacing.xs },
  settingTitle: { ...typography.h3, color: colors.ink },
  settingDetail: { ...typography.caption, color: colors.textSecondary },
  notice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    padding: spacing.lg,
    backgroundColor: colors.brandSoft,
    borderRadius: radii.input,
  },
});
