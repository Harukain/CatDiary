import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, radii, spacing, typography } from '@cat-diary/design-tokens';
import {
  authApi,
  type NotificationLogSummary,
  type NotificationStatus,
} from '../src/features/auth/auth-api';
import { useSession } from '../src/features/auth/session-provider';
import { Body, Card, ErrorText, Screen, Title } from '../src/shared/ui/primitives';

const filters: Array<{ label: string; value?: NotificationStatus }> = [
  { label: '全部' },
  { label: '已送达', value: 'DELIVERED' },
  { label: '发送中', value: 'SENT' },
  { label: '队列中', value: 'QUEUED' },
  { label: '失败', value: 'FAILED' },
  { label: '跳过', value: 'SKIPPED' },
];

export default function NotificationLogsRoute() {
  const router = useRouter();
  const { session, activeFamily } = useSession();
  const [status, setStatus] = useState<NotificationStatus>();
  const [items, setItems] = useState<NotificationLogSummary[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [retryingId, setRetryingId] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(
    async (cursor?: string, append = false) => {
      if (!session || !activeFamily) return;
      if (append) setLoadingMore(true);
      else {
        setLoading(true);
        setError('');
      }
      try {
        const result = await authApi.listNotificationLogs(
          session.accessToken,
          activeFamily.id,
          status,
          cursor,
        );
        setItems((current) => (append ? [...current, ...result.items] : result.items));
        setNextCursor(result.page.nextCursor);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : '提醒发送记录加载失败');
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [activeFamily, session, status],
  );

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const canRetry = activeFamily?.role === 'OWNER' || activeFamily?.role === 'ADMIN';
  function requestRetry(item: NotificationLogSummary) {
    Alert.alert('重新发送提醒？', `将再次尝试发送「${item.task?.title ?? '已删除任务'}」的提醒。`, [
      { text: '取消', style: 'cancel' },
      { text: '确认重试', onPress: () => void retry(item) },
    ]);
  }
  async function retry(item: NotificationLogSummary) {
    if (!session || !activeFamily) return;
    setRetryingId(item.id);
    setError('');
    try {
      const next = await authApi.retryNotificationLog(
        session.accessToken,
        activeFamily.id,
        item.id,
      );
      setItems((current) => current.map((value) => (value.id === next.id ? next : value)));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '重新发送失败');
    } finally {
      setRetryingId('');
    }
  }

  return (
    <Screen>
      <View style={styles.nav}>
        <Pressable accessibilityLabel="返回" onPress={() => router.back()} style={styles.back}>
          <Ionicons name="chevron-back" size={22} color={colors.ink} />
        </Pressable>
        <Text style={styles.navTitle}>提醒发送记录</Text>
        <View style={styles.back} />
      </View>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View>
          <Text style={styles.title}>提醒状态</Text>
          <Text style={styles.subtitle}>查看最近的发送结果；失败项仅管理员可重试。</Text>
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filters}
        >
          {filters.map((filter) => (
            <Pressable
              key={filter.label}
              accessibilityRole="button"
              accessibilityState={{ selected: status === filter.value }}
              onPress={() => setStatus(filter.value)}
              style={[styles.filter, status === filter.value && styles.filterActive]}
            >
              <Text style={[styles.filterText, status === filter.value && styles.filterTextActive]}>
                {filter.label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
        {error ? <ErrorText>{error}</ErrorText> : null}
        {loading ? (
          <ActivityIndicator color={colors.brand} />
        ) : items.length ? (
          <View style={styles.list}>
            {items.map((item) => (
              <Card key={item.id}>
                <View style={styles.itemTop}>
                  <View style={styles.itemHeading}>
                    <Text style={styles.itemTitle}>{item.task?.title ?? '原任务已删除'}</Text>
                    <Text style={styles.itemMeta}>
                      {channelLabel(item.channel)} · {formatDate(item.scheduledAt)}
                    </Text>
                  </View>
                  <StatusBadge status={item.status} />
                </View>
                {item.status === 'FAILED' ? (
                  <View style={styles.failure}>
                    <Text style={styles.failureText}>
                      {item.errorMessageSafe || '发送失败，请检查通知渠道后重试。'}
                    </Text>
                    {canRetry ? (
                      retryingId === item.id ? (
                        <ActivityIndicator color={colors.dangerDark} />
                      ) : (
                        <Pressable
                          accessibilityRole="button"
                          onPress={() => requestRetry(item)}
                          style={({ pressed }) => [styles.retry, pressed && styles.pressed]}
                        >
                          <Text style={styles.retryText}>重新发送</Text>
                        </Pressable>
                      )
                    ) : null}
                  </View>
                ) : null}
                {item.status === 'DELIVERED' && item.sentAt ? (
                  <Text style={styles.delivered}>送达于 {formatDate(item.sentAt)}</Text>
                ) : null}
              </Card>
            ))}
            {nextCursor ? (
              <Pressable
                accessibilityRole="button"
                disabled={loadingMore}
                onPress={() => void load(nextCursor, true)}
                style={styles.more}
              >
                {loadingMore ? (
                  <ActivityIndicator color={colors.brand} />
                ) : (
                  <Text style={styles.moreText}>加载更多</Text>
                )}
              </Pressable>
            ) : null}
          </View>
        ) : (
          <Card>
            <Title>还没有提醒记录</Title>
            <Body>创建照顾计划并到达提醒时间后，这里会显示发送状态。</Body>
          </Card>
        )}
      </ScrollView>
    </Screen>
  );
}

function StatusBadge({ status }: { status: NotificationStatus }) {
  const detail = statusDetail(status);
  return (
    <View style={[styles.badge, detail.style]}>
      <Text style={[styles.badgeText, detail.textStyle]}>{detail.label}</Text>
    </View>
  );
}
function statusDetail(status: NotificationStatus) {
  return {
    QUEUED: { label: '队列中', style: styles.warningBadge, textStyle: styles.warningText },
    SENT: { label: '已发送', style: styles.brandBadge, textStyle: styles.brandText },
    DELIVERED: { label: '已送达', style: styles.successBadge, textStyle: styles.successText },
    FAILED: { label: '发送失败', style: styles.dangerBadge, textStyle: styles.dangerText },
    SKIPPED: { label: '已跳过', style: styles.neutralBadge, textStyle: styles.neutralText },
  }[status];
}
function channelLabel(channel: NotificationLogSummary['channel']) {
  return { DEVELOPMENT: '开发通知', EXPO_PUSH: '手机推送', FEISHU: '飞书通知' }[channel];
}
function formatDate(value: string) {
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(value));
}

const styles = StyleSheet.create({
  nav: { height: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  back: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  navTitle: { ...typography.h3, color: colors.ink },
  content: { gap: spacing.xl, paddingBottom: spacing.huge },
  title: { ...typography.h1, color: colors.ink },
  subtitle: { ...typography.secondary, color: colors.textSecondary, marginTop: spacing.xs },
  filters: { gap: spacing.sm },
  filter: {
    minHeight: 40,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.lg,
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  filterActive: { backgroundColor: colors.ink },
  filterText: { ...typography.caption, color: colors.textSecondary, fontWeight: '600' },
  filterTextActive: { color: colors.surface },
  list: { gap: spacing.md },
  itemTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  itemHeading: { flex: 1, gap: spacing.xs },
  itemTitle: { ...typography.h3, color: colors.ink },
  itemMeta: { ...typography.caption, color: colors.textSecondary, fontVariant: ['tabular-nums'] },
  badge: { borderRadius: radii.pill, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  badgeText: { ...typography.caption, fontWeight: '600' },
  warningBadge: { backgroundColor: colors.warningSoft },
  warningText: { color: colors.warningDark },
  brandBadge: { backgroundColor: colors.brandSoft },
  brandText: { color: colors.brand },
  successBadge: { backgroundColor: colors.successSoft },
  successText: { color: colors.successDark },
  dangerBadge: { backgroundColor: colors.dangerSoft },
  dangerText: { color: colors.dangerDark },
  neutralBadge: { backgroundColor: colors.divider },
  neutralText: { color: colors.textSecondary },
  failure: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radii.input,
    backgroundColor: colors.dangerSoft,
  },
  failureText: { flex: 1, ...typography.caption, color: colors.dangerDark },
  retry: { minHeight: 40, justifyContent: 'center', paddingHorizontal: spacing.sm },
  retryText: { ...typography.caption, color: colors.dangerDark, fontWeight: '700' },
  delivered: { ...typography.caption, color: colors.successDark, fontVariant: ['tabular-nums'] },
  more: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  moreText: { ...typography.secondary, color: colors.brand, fontWeight: '600' },
  pressed: { opacity: 0.72, transform: [{ scale: 0.97 }] },
});
