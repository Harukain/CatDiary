import { useCallback, useMemo, useState } from 'react';
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
import {
  mergeRetriedNotificationLog,
  notificationLogChannelLabel,
  notificationLogEmptyCopy,
  notificationLogPageStats,
  notificationLogRetrySuccessMessage,
  notificationLogStatusCopy,
} from '../src/features/notifications/notification-log-rules';
import {
  Body,
  Card,
  ErrorText,
  Screen,
  SuccessText,
  TextButton,
  Title,
} from '../src/shared/ui/primitives';

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
  const [success, setSuccess] = useState('');
  const [lastLoadedAt, setLastLoadedAt] = useState<Date | null>(null);
  const stats = useMemo(() => notificationLogPageStats(items), [items]);
  const emptyCopy = notificationLogEmptyCopy(status);

  const load = useCallback(
    async (cursor?: string, append = false) => {
      if (!session || !activeFamily) return;
      if (append) setLoadingMore(true);
      else {
        setLoading(true);
        setError('');
        setSuccess('');
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
        setLastLoadedAt(new Date());
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
    setSuccess('');
    try {
      const next = await authApi.retryNotificationLog(
        session.accessToken,
        activeFamily.id,
        item.id,
      );
      setItems((current) => mergeRetriedNotificationLog(current, next, status));
      setSuccess(notificationLogRetrySuccessMessage(next, status));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '重新发送失败');
    } finally {
      setRetryingId('');
    }
  }

  return (
    <Screen>
      <View style={styles.nav}>
        <Pressable
          testID="notification-logs.back.button"
          accessibilityLabel="返回"
          onPress={() => router.back()}
          style={styles.back}
        >
          <Ionicons name="chevron-back" size={22} color={colors.ink} />
        </Pressable>
        <Text testID="notification-logs.title" style={styles.navTitle}>
          提醒发送记录
        </Text>
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
              testID={`notification-logs.filter.${filter.value ?? 'ALL'}`}
              accessibilityRole="button"
              accessibilityState={{ selected: status === filter.value }}
              onPress={() => {
                setStatus(filter.value);
                setSuccess('');
              }}
              style={[styles.filter, status === filter.value && styles.filterActive]}
            >
              <Text style={[styles.filterText, status === filter.value && styles.filterTextActive]}>
                {filter.label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
        <Card testID="notification-logs.summary.card">
          <View style={styles.summaryTop}>
            <View style={styles.summaryCopy}>
              <Title>
                {status ? `${notificationLogStatusCopy(status).label}记录` : '本页概览'}
              </Title>
              <Body>
                {lastLoadedAt
                  ? `已加载 ${stats.total} 条，最近刷新 ${formatDate(lastLoadedAt.toISOString())}`
                  : '正在读取最近的提醒发送状态。'}
              </Body>
            </View>
            <TextButton
              testID="notification-logs.refresh.button"
              label={loading ? '刷新中' : '刷新'}
              disabled={loading}
              onPress={() => void load()}
            />
          </View>
          <View style={styles.stats}>
            <StatChip
              testID="notification-logs.stat.failed"
              label="失败"
              value={stats.failed}
              tone="danger"
            />
            <StatChip
              testID="notification-logs.stat.queued"
              label="队列"
              value={stats.queued}
              tone="warning"
            />
            <StatChip
              testID="notification-logs.stat.sent"
              label="已发送"
              value={stats.sent}
              tone="brand"
            />
            <StatChip
              testID="notification-logs.stat.delivered"
              label="送达"
              value={stats.delivered}
              tone="success"
            />
          </View>
          {status ? (
            <Text style={styles.statusHelp}>{notificationLogStatusCopy(status).description}</Text>
          ) : null}
        </Card>
        {error ? <ErrorText testID="notification-logs.error.text">{error}</ErrorText> : null}
        {success ? (
          <SuccessText testID="notification-logs.success.text">{success}</SuccessText>
        ) : null}
        {loading ? (
          <ActivityIndicator testID="notification-logs.loading.indicator" color={colors.brand} />
        ) : items.length ? (
          <View testID="notification-logs.list" style={styles.list}>
            {items.map((item) => (
              <Card key={item.id} testID="notification-logs.item">
                <View style={styles.itemTop}>
                  <View style={styles.itemHeading}>
                    <Text testID="notification-logs.item.title" style={styles.itemTitle}>
                      {item.task?.title ?? '原任务已删除'}
                    </Text>
                    <Text testID="notification-logs.item.meta" style={styles.itemMeta}>
                      {notificationLogChannelLabel(item.channel)} · 计划{' '}
                      {formatDate(item.scheduledAt)}
                      {item.attempt ? ` · 第 ${item.attempt} 次` : ''}
                    </Text>
                  </View>
                  <StatusBadge testID="notification-logs.item.status" status={item.status} />
                </View>
                <Text
                  testID="notification-logs.item.status-description"
                  style={styles.statusDescription}
                >
                  {notificationLogStatusCopy(item.status).description}
                </Text>
                {item.status === 'FAILED' ? (
                  <View testID="notification-logs.failure.card" style={styles.failure}>
                    <Text testID="notification-logs.failure.reason" style={styles.failureText}>
                      {item.errorMessageSafe || '发送失败，请检查通知渠道后重试。'}
                    </Text>
                    {canRetry ? (
                      retryingId === item.id ? (
                        <ActivityIndicator
                          testID="notification-logs.retry.loading"
                          color={colors.dangerDark}
                        />
                      ) : (
                        <Pressable
                          testID="notification-logs.retry.button"
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
                testID="notification-logs.load-more.button"
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
          <Card testID="notification-logs.empty.card">
            <Title testID="notification-logs.empty.title">{emptyCopy.title}</Title>
            <Body testID="notification-logs.empty.body">{emptyCopy.body}</Body>
          </Card>
        )}
      </ScrollView>
    </Screen>
  );
}

function StatusBadge({ status, testID }: { status: NotificationStatus; testID?: string }) {
  const detail = notificationLogStatusCopy(status);
  return <ToneBadge testID={testID} label={detail.label} tone={detail.tone} />;
}

function StatChip({
  label,
  value,
  tone,
  testID,
}: {
  label: string;
  value: number;
  tone: 'brand' | 'success' | 'warning' | 'danger';
  testID?: string;
}) {
  return (
    <View testID={testID} style={styles.statChip}>
      <Text style={styles.statValue}>{value}</Text>
      <ToneBadge label={label} tone={tone} />
    </View>
  );
}

function ToneBadge({
  label,
  tone,
  testID,
}: {
  label: string;
  tone: 'brand' | 'success' | 'warning' | 'danger' | 'neutral';
  testID?: string;
}) {
  const detail = toneDetail(tone);
  return (
    <View testID={testID} style={[styles.badge, detail.style]}>
      <Text style={[styles.badgeText, detail.textStyle]}>{label}</Text>
    </View>
  );
}

function toneDetail(tone: 'brand' | 'success' | 'warning' | 'danger' | 'neutral') {
  return {
    brand: { style: styles.brandBadge, textStyle: styles.brandText },
    success: { style: styles.successBadge, textStyle: styles.successText },
    warning: { style: styles.warningBadge, textStyle: styles.warningText },
    danger: { style: styles.dangerBadge, textStyle: styles.dangerText },
    neutral: { style: styles.neutralBadge, textStyle: styles.neutralText },
  }[tone];
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
  summaryTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  summaryCopy: { flex: 1, gap: spacing.xs },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  statChip: {
    minHeight: 44,
    minWidth: 76,
    alignItems: 'flex-start',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  statValue: {
    ...typography.h2,
    color: colors.ink,
    fontVariant: ['tabular-nums'],
  },
  statusHelp: { ...typography.caption, color: colors.textSecondary },
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
  statusDescription: { ...typography.caption, color: colors.textSecondary },
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
