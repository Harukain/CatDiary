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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radii, spacing, typography } from '@cat-diary/design-tokens';
import {
  authApi,
  AuthApiError,
  type CompleteTaskInput,
  type TaskSummary,
} from '../../src/features/auth/auth-api';
import { useSession } from '../../src/features/auth/session-provider';
import { Body, Card, ErrorText, Screen, Title } from '../../src/shared/ui/primitives';
import {
  cacheTasks,
  enqueueOfflineOperation,
  flushOfflineOperations,
  getCachedTasks,
  getOfflineConflicts,
  isNetworkFailure,
  removeCachedTask,
} from '../../src/features/offline/offline-queue';
import {
  optimisticCompletedTask,
  optimisticPendingTask,
  taskFromMutationResult,
} from '../../src/features/tasks/task-mutation';
import { TaskUndoBanner } from '../../src/features/tasks/task-undo-banner';
import { TaskCompletionSheet } from '../../src/features/tasks/task-completion-sheet';
import { isMedicalTask } from '../../src/features/tasks/task-completion';
import { bottomTabScrollPadding } from '../../src/shared/ui/bottom-tab-layout';

const scopes = [
  { value: 'today', label: '今天' },
  { value: 'upcoming', label: '即将' },
  { value: 'overdue', label: '逾期' },
  { value: 'completed', label: '完成' },
] as const;
type Scope = (typeof scopes)[number]['value'];

export default function TasksTab() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session, activeFamily } = useSession();
  const [scope, setScope] = useState<Scope>('today');
  const [tasks, setTasks] = useState<TaskSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState('');
  const [error, setError] = useState('');
  const [offlineNotice, setOfflineNotice] = useState('');
  const [undoableTask, setUndoableTask] = useState<TaskSummary>();
  const [completingTask, setCompletingTask] = useState<TaskSummary>();
  const [completionError, setCompletionError] = useState('');
  const dismissUndo = useCallback(() => setUndoableTask(undefined), []);

  const load = useCallback(async () => {
    if (!session || !activeFamily) return;
    setLoading(true);
    setError('');
    try {
      const sync = await flushOfflineOperations(session.accessToken, authApi.sendTaskOperation);
      if (sync.synced) setOfflineNotice(`已同步 ${sync.synced} 条离线操作`);
      const conflicts = await getOfflineConflicts(activeFamily.id);
      if (conflicts.length) setOfflineNotice(`${conflicts.length} 条离线操作需要处理冲突`);
      const result = await authApi.listTasks(session.accessToken, activeFamily.id, scope);
      setTasks(result.items);
      await cacheTasks(activeFamily.id, scope, result.items);
    } catch (cause) {
      if (isNetworkFailure(cause)) {
        setTasks(await getCachedTasks(activeFamily.id, scope));
        setOfflineNotice('当前离线，展示本机最近任务');
      } else setError(cause instanceof AuthApiError ? cause.message : '任务加载失败');
    } finally {
      setLoading(false);
    }
  }, [activeFamily, scope, session]);
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  function requestComplete(task: TaskSummary) {
    setCompletionError('');
    setError('');
    setCompletingTask(task);
  }
  async function complete(task: TaskSummary, input: CompleteTaskInput) {
    if (!session || !activeFamily) return;
    setActionId(task.id);
    setError('');
    setCompletionError('');
    const operation = authApi.createCompleteOperation(activeFamily.id, task, input);
    try {
      const result = await authApi.sendTaskOperation(session.accessToken, operation);
      setCompletingTask(undefined);
      await load();
      if (!isMedicalTask(task)) setUndoableTask(taskFromMutationResult(result, task));
    } catch (cause) {
      if (isNetworkFailure(cause)) {
        try {
          await enqueueOfflineOperation(operation);
          await removeCachedTask(task.id);
          setTasks((current) => current.filter((item) => item.id !== task.id));
          setOfflineNotice('网络不可用，完成操作已保存并将在恢复后同步');
          if (!isMedicalTask(task)) setUndoableTask(optimisticCompletedTask(task, input.actualAt));
          setCompletingTask(undefined);
        } catch {
          setCompletionError('离线操作保存失败，请稍后重试');
        }
      } else setCompletionError(cause instanceof AuthApiError ? cause.message : '任务完成失败');
    } finally {
      setActionId('');
    }
  }
  function requestSkip(task: TaskSummary) {
    Alert.alert('跳过这次任务', '只会跳过本次任务，不会暂停长期计划。', [
      { text: '取消', style: 'cancel' },
      { text: '确认跳过', onPress: () => void skip(task) },
    ]);
  }
  async function skip(task: TaskSummary) {
    if (!session || !activeFamily) return;
    setActionId(task.id);
    setError('');
    const operation = authApi.createSkipOperation(activeFamily.id, task);
    try {
      await authApi.sendTaskOperation(session.accessToken, operation);
      await load();
    } catch (cause) {
      if (isNetworkFailure(cause)) {
        await enqueueOfflineOperation(operation);
        await removeCachedTask(task.id);
        setTasks((current) => current.filter((item) => item.id !== task.id));
        setOfflineNotice('网络不可用，跳过操作已保存并将在恢复后同步');
      } else setError(cause instanceof AuthApiError ? cause.message : '跳过失败');
    } finally {
      setActionId('');
    }
  }
  async function undo(task: TaskSummary, quickUndo = false) {
    if (!session || !activeFamily) return;
    setActionId(task.id);
    setError('');
    const operation = authApi.createUndoOperation(activeFamily.id, task);
    try {
      await authApi.sendTaskOperation(session.accessToken, operation);
      if (quickUndo) dismissUndo();
      await load();
    } catch (cause) {
      if (isNetworkFailure(cause)) {
        await enqueueOfflineOperation(operation);
        await removeCachedTask(task.id);
        if (quickUndo) {
          const pendingTask = optimisticPendingTask(task);
          setTasks((current) => [pendingTask, ...current.filter((item) => item.id !== task.id)]);
          dismissUndo();
        } else setTasks((current) => current.filter((item) => item.id !== task.id));
        setOfflineNotice('网络不可用，撤销操作已保存并将在恢复后同步');
      } else {
        if (quickUndo) dismissUndo();
        setError(cause instanceof AuthApiError ? cause.message : '撤销失败');
      }
    } finally {
      setActionId('');
    }
  }

  const canManagePlans = activeFamily?.role === 'OWNER' || activeFamily?.role === 'ADMIN';
  return (
    <Screen>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: bottomTabScrollPadding(insets.bottom) },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.heading}>
          <View>
            <Text style={styles.title}>照顾任务</Text>
            <Text style={styles.subtitle}>未来事项与历史结果清楚分开</Text>
          </View>
          {canManagePlans ? (
            <View style={styles.headerActions}>
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push('/plans')}
                style={styles.newButton}
              >
                <Text style={styles.newButtonText}>管理计划</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push('/plans/new')}
                style={styles.newButton}
              >
                <Text style={styles.newButtonText}>新建</Text>
              </Pressable>
            </View>
          ) : null}
        </View>
        <View style={styles.segment}>
          {scopes.map((item) => (
            <Pressable
              key={item.value}
              accessibilityRole="button"
              accessibilityState={{ selected: scope === item.value }}
              onPress={() => setScope(item.value)}
              style={[styles.segmentItem, scope === item.value && styles.active]}
            >
              <Text style={[styles.segmentText, scope === item.value && styles.activeText]}>
                {item.label}
              </Text>
            </Pressable>
          ))}
        </View>
        {offlineNotice ? (
          <Pressable
            accessibilityRole="button"
            disabled={!offlineNotice.includes('冲突')}
            onPress={() => router.push('/sync-conflicts')}
            style={styles.offlineNotice}
          >
            <Text style={styles.offlineNoticeText}>
              {offlineNotice}
              {offlineNotice.includes('冲突') ? ' · 点击处理' : ''}
            </Text>
          </Pressable>
        ) : null}
        {undoableTask ? (
          <TaskUndoBanner
            task={undoableTask}
            busy={actionId === undoableTask.id}
            onUndo={() => void undo(undoableTask, true)}
            onDismiss={dismissUndo}
          />
        ) : null}
        {error ? <ErrorText>{error}</ErrorText> : null}
        {loading ? (
          <ActivityIndicator color={colors.brand} />
        ) : tasks.length ? (
          <Card>
            {tasks.map((task) => (
              <View
                key={task.id}
                style={[
                  styles.task,
                  (task.status === 'COMPLETED' || task.status === 'SKIPPED') && styles.completed,
                ]}
              >
                <View
                  style={[
                    styles.dot,
                    scope === 'overdue'
                      ? styles.dotDanger
                      : task.status === 'COMPLETED'
                        ? styles.dotSuccess
                        : null,
                  ]}
                />
                <Text style={[styles.time, scope === 'overdue' && styles.danger]}>
                  {formatTime(task.scheduledAt)}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`查看${task.title}详情`}
                  onPress={() => router.push({ pathname: '/tasks/[id]', params: { id: task.id } })}
                  style={({ pressed }) => [styles.taskBody, pressed && styles.taskBodyPressed]}
                >
                  <Text
                    style={[
                      styles.taskTitle,
                      (task.status === 'COMPLETED' || task.status === 'SKIPPED') && styles.strike,
                    ]}
                  >
                    {task.title}
                  </Text>
                  <Text style={styles.meta}>
                    {task.pet?.name ?? '公共任务'} · {typeLabel(task.type)}
                  </Text>
                </Pressable>
                {actionId === task.id ? (
                  <ActivityIndicator color={colors.brand} />
                ) : task.status === 'COMPLETED' || task.status === 'SKIPPED' ? (
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => void undo(task)}
                    style={styles.action}
                  >
                    <Text style={styles.undo}>撤销</Text>
                  </Pressable>
                ) : (
                  <View style={styles.actions}>
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => requestSkip(task)}
                      style={styles.smallAction}
                    >
                      <Text style={styles.skip}>跳过</Text>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => requestComplete(task)}
                      style={styles.complete}
                    >
                      <Text style={styles.completeText}>
                        {scope === 'overdue' ? '补完成' : '完成'}
                      </Text>
                    </Pressable>
                  </View>
                )}
              </View>
            ))}
          </Card>
        ) : (
          <Card>
            <Title>{emptyTitle(scope)}</Title>
            <Body>{emptyBody(scope)}</Body>
            {canManagePlans && scope !== 'completed' ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push('/plans/new')}
                style={styles.emptyAction}
              >
                <Text style={styles.emptyActionText}>创建照顾计划</Text>
              </Pressable>
            ) : null}
          </Card>
        )}
      </ScrollView>
      <TaskCompletionSheet
        task={completingTask}
        visible={!!completingTask}
        busy={!!completingTask && actionId === completingTask.id}
        submissionError={completionError}
        onCancel={() => {
          setCompletionError('');
          setCompletingTask(undefined);
        }}
        onSubmit={(input) => completingTask && void complete(completingTask, input)}
      />
    </Screen>
  );
}

function formatTime(value: string) {
  return new Date(value).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}
function typeLabel(type: string) {
  return (
    (
      { VACCINE: '疫苗', DEWORMING: '驱虫', MEDICATION: '用药', LITTER: '铲屎' } as Record<
        string,
        string
      >
    )[type] ?? '照顾'
  );
}
function emptyTitle(scope: Scope) {
  return scope === 'today'
    ? '今天暂无任务'
    : scope === 'upcoming'
      ? '近期没有待办'
      : scope === 'overdue'
        ? '没有逾期任务'
        : '还没有完成记录';
}
function emptyBody(scope: Scope) {
  return scope === 'completed'
    ? '完成任务后，对应结果会同时进入记录时间线。'
    : '创建疫苗、驱虫、用药或铲屎计划后，系统会生成未来 7 天任务。';
}
const styles = StyleSheet.create({
  content: { gap: spacing.xxl },
  heading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  title: { ...typography.h1, color: colors.ink },
  subtitle: { ...typography.secondary, color: colors.textSecondary, marginTop: spacing.xs },
  newButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.md },
  newButtonText: { fontSize: 13, fontWeight: '600', color: colors.brand },
  segment: {
    height: 44,
    borderRadius: radii.selector,
    backgroundColor: colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.xs,
    gap: spacing.xs,
  },
  segmentItem: {
    flex: 1,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.segment,
  },
  active: { backgroundColor: colors.brandSoft },
  segmentText: { fontSize: 13, color: colors.textSecondary },
  activeText: { fontWeight: '600', color: colors.brand },
  task: {
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
    paddingVertical: spacing.sm,
  },
  completed: { opacity: 0.6 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.brand },
  dotDanger: { backgroundColor: colors.danger },
  dotSuccess: { backgroundColor: colors.success },
  time: { width: 42, fontSize: 12, color: colors.ink, fontVariant: ['tabular-nums'] },
  danger: { color: colors.dangerDark },
  taskBody: { flex: 1, minHeight: 44, justifyContent: 'center' },
  taskBodyPressed: { opacity: 0.72 },
  taskTitle: { ...typography.h3, color: colors.ink },
  strike: { textDecorationLine: 'line-through' },
  meta: { ...typography.caption, color: colors.textSecondary, marginTop: spacing.xs },
  actions: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  action: { minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.sm },
  smallAction: { minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.xs },
  skip: { fontSize: 12, color: colors.textSecondary },
  complete: {
    minHeight: 32,
    borderRadius: 16,
    backgroundColor: colors.ink,
    paddingHorizontal: spacing.md,
    justifyContent: 'center',
  },
  completeText: { fontSize: 12, fontWeight: '600', color: colors.surface },
  undo: { fontSize: 12, fontWeight: '600', color: colors.successDark },
  emptyAction: { minHeight: 44, justifyContent: 'center', alignItems: 'flex-start' },
  emptyActionText: { fontSize: 13, fontWeight: '600', color: colors.brand },
  offlineNotice: {
    backgroundColor: colors.warningSoft,
    borderRadius: radii.banner,
    padding: spacing.md,
  },
  offlineNoticeText: { ...typography.caption, color: colors.warningDark },
});
