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
import { authApi, type TaskSummary } from '../src/features/auth/auth-api';
import { useSession } from '../src/features/auth/session-provider';
import {
  discardOfflineOperation,
  flushOfflineOperations,
  getOfflineConflicts,
  retryOfflineOperation,
  type OfflineConflict,
} from '../src/features/offline/offline-queue';
import {
  Body,
  Card,
  ErrorText,
  PrimaryButton,
  Screen,
  TextButton,
  Title,
} from '../src/shared/ui/primitives';

type ConflictView = OfflineConflict & { serverTask?: TaskSummary; snapshotError?: string };

export default function SyncConflictsScreen() {
  const router = useRouter();
  const { session, activeFamily } = useSession();
  const [items, setItems] = useState<ConflictView[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState('');
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    if (!session || !activeFamily) return;
    setLoading(true);
    setError('');
    try {
      const conflicts = await getOfflineConflicts(activeFamily.id);
      const views = await Promise.all(
        conflicts.map(async (conflict): Promise<ConflictView> => {
          const match = conflict.path.match(/^\/tasks\/([0-9a-f-]+)\//i);
          if (!match?.[1]) return conflict;
          try {
            return {
              ...conflict,
              serverTask: await authApi.getTask(session.accessToken, activeFamily.id, match[1]),
            };
          } catch (cause) {
            return {
              ...conflict,
              snapshotError: cause instanceof Error ? cause.message : '无法读取服务端状态',
            };
          }
        }),
      );
      setItems(views);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '冲突加载失败');
    } finally {
      setLoading(false);
    }
  }, [activeFamily, session]);
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );
  async function keepServer(item: ConflictView) {
    setActionId(item.id);
    try {
      await discardOfflineOperation(item.id);
      setItems((current) => current.filter((entry) => entry.id !== item.id));
    } finally {
      setActionId('');
    }
  }
  async function retry(item: ConflictView) {
    if (!session) return;
    setActionId(item.id);
    setError('');
    try {
      const body =
        item.serverTask && typeof item.body.version === 'number'
          ? { ...item.body, version: item.serverTask.version }
          : item.body;
      await retryOfflineOperation(item.id, body);
      const result = await flushOfflineOperations(
        session.accessToken,
        authApi.sendOfflineOperation,
      );
      if (result.synced) setItems((current) => current.filter((entry) => entry.id !== item.id));
      else {
        await load();
        Alert.alert(
          '仍未同步',
          result.conflicts ? '服务端状态再次变化，请重新确认。' : '操作已保留，联网后会继续同步。',
        );
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '重试失败');
    } finally {
      setActionId('');
    }
  }
  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.heading}>
          <View>
            <Text style={styles.title}>同步冲突</Text>
            <Text style={styles.subtitle}>逐条确认本机操作与家庭最新状态</Text>
          </View>
          <Pressable accessibilityLabel="关闭" onPress={() => router.back()} style={styles.close}>
            <Ionicons name="close" size={22} color={colors.ink} />
          </Pressable>
        </View>
        <View style={styles.notice}>
          <Ionicons name="shield-checkmark-outline" size={20} color={colors.warningDark} />
          <Text style={styles.noticeText}>
            系统不会自动覆盖其他家庭成员已经提交的照顾或医疗结果。
          </Text>
        </View>
        {loading ? (
          <ActivityIndicator color={colors.brand} />
        ) : error ? (
          <ErrorText>{error}</ErrorText>
        ) : items.length ? (
          items.map((item) => (
            <ConflictCard
              key={item.id}
              item={item}
              busy={actionId === item.id}
              onKeep={() => void keepServer(item)}
              onRetry={() => void retry(item)}
            />
          ))
        ) : (
          <Card>
            <Title>没有待处理冲突</Title>
            <Body>所有离线操作都已同步，或已按照你的选择完成处理。</Body>
            <PrimaryButton label="返回" onPress={() => router.back()} />
          </Card>
        )}
      </ScrollView>
    </Screen>
  );
}

function ConflictCard({
  item,
  busy,
  onKeep,
  onRetry,
}: {
  item: ConflictView;
  busy: boolean;
  onKeep(): void;
  onRetry(): void;
}) {
  const action = item.path.endsWith('/complete')
    ? '完成任务'
    : item.path.endsWith('/skip')
      ? '跳过任务'
      : item.path.endsWith('/undo')
        ? '撤销任务'
        : item.path === '/records'
          ? '新增记录'
          : '离线操作';
  const canRetry =
    item.status === 'FAILED' ||
    (item.lastError === 'VERSION_CONFLICT' && item.serverTask?.status === 'PENDING');
  return (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <View style={[styles.badge, item.status === 'FAILED' && styles.failedBadge]}>
          <Text style={styles.badgeText}>
            {item.status === 'CONFLICT' ? '需要确认' : '同步失败'}
          </Text>
        </View>
        <Text style={styles.time}>
          {new Date(item.createdAt).toLocaleString('zh-CN', { hour12: false })}
        </Text>
      </View>
      <Text style={styles.actionTitle}>{action}</Text>
      <Text style={styles.code}>{errorLabel(item.lastError)}</Text>
      <View style={styles.compare}>
        <View style={styles.side}>
          <Text style={styles.sideLabel}>本机操作</Text>
          <Text style={styles.value}>版本：{String(item.body.version ?? '新记录')}</Text>
          {item.body.actualAt ? (
            <Text style={styles.value}>
              实际时间：
              {new Date(String(item.body.actualAt)).toLocaleString('zh-CN', { hour12: false })}
            </Text>
          ) : null}
          <Text numberOfLines={3} style={styles.payload}>
            {safePayload(item.body)}
          </Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.side}>
          <Text style={styles.sideLabel}>服务端最新状态</Text>
          {item.serverTask ? (
            <>
              <Text style={styles.value}>状态：{statusLabel(item.serverTask.status)}</Text>
              <Text style={styles.value}>版本：{item.serverTask.version}</Text>
              <Text style={styles.value}>任务：{item.serverTask.title}</Text>
              {item.serverTask.completedAt ? (
                <Text style={styles.value}>
                  处理时间：
                  {new Date(item.serverTask.completedAt).toLocaleString('zh-CN', { hour12: false })}
                </Text>
              ) : null}
            </>
          ) : (
            <Text style={styles.payload}>
              {item.snapshotError ?? '该操作没有可对照的单一服务端实体'}
            </Text>
          )}
        </View>
      </View>
      <View style={styles.explain}>
        <Text style={styles.explainText}>
          {canRetry
            ? '可以基于服务端最新版本重新提交；提交前请确认操作仍然符合实际情况。'
            : '建议保留服务端结果，避免重复完成或覆盖他人的照顾记录。'}
        </Text>
      </View>
      {canRetry ? <PrimaryButton label="基于最新版本重试" busy={busy} onPress={onRetry} /> : null}
      <TextButton label="保留服务端并移除本机操作" disabled={busy} onPress={onKeep} />
    </View>
  );
}
function errorLabel(code: string | null) {
  return (
    (
      {
        VERSION_CONFLICT: '提交期间数据已被其他成员修改',
        TASK_ALREADY_COMPLETED: '任务已经由其他成员完成',
        IDEMPOTENCY_KEY_REUSED: '同一操作标识对应了不同内容',
      } as Record<string, string>
    )[code ?? ''] ?? (code ? `错误：${code}` : '等待重新同步')
  );
}
function statusLabel(status: TaskSummary['status']) {
  return (
    { PENDING: '待完成', COMPLETED: '已完成', SKIPPED: '已跳过', CANCELLED: '已取消' } as const
  )[status];
}
function safePayload(body: Record<string, unknown>) {
  const copy = { ...body };
  delete copy.medicalConfirmed;
  return JSON.stringify(copy, null, 2);
}
const styles = StyleSheet.create({
  content: { gap: spacing.lg, paddingBottom: 80 },
  heading: { flexDirection: 'row', justifyContent: 'space-between' },
  title: { ...typography.h1, color: colors.ink },
  subtitle: { ...typography.secondary, color: colors.textSecondary, marginTop: spacing.xs },
  close: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notice: {
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.input,
    backgroundColor: colors.brandSoft,
  },
  noticeText: { ...typography.caption, color: colors.warningDark, flex: 1 },
  card: {
    padding: spacing.lg,
    borderRadius: radii.card,
    backgroundColor: colors.surface,
    gap: spacing.md,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  badge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
    borderRadius: radii.pill,
    backgroundColor: '#FBE4D9',
  },
  failedBadge: { backgroundColor: '#F5EEDF' },
  badgeText: { ...typography.caption, color: colors.dangerDark, fontWeight: '700' },
  time: { ...typography.caption, color: colors.textTertiary },
  actionTitle: { ...typography.h2, color: colors.ink },
  code: { ...typography.secondary, color: colors.dangerDark },
  compare: { flexDirection: 'row', gap: spacing.md },
  side: { flex: 1, gap: spacing.xs },
  divider: { width: 1, backgroundColor: colors.divider },
  sideLabel: { ...typography.caption, color: colors.brand, fontWeight: '700' },
  value: { ...typography.caption, color: colors.textSecondary },
  payload: { fontSize: 10, lineHeight: 15, color: colors.textTertiary },
  explain: { padding: spacing.md, borderRadius: radii.input, backgroundColor: colors.page },
  explainText: { ...typography.caption, color: colors.textSecondary },
});
