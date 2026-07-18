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
import { Body, Card, ErrorText, Screen, TextButton, Title } from '../../src/shared/ui/primitives';
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
  recordIdFromTaskMutationResult,
  taskFromMutationResult,
} from '../../src/features/tasks/task-mutation';
import { TaskUndoBanner } from '../../src/features/tasks/task-undo-banner';
import { TaskCompletionSheet } from '../../src/features/tasks/task-completion-sheet';
import { canQuickUndoTaskCompletion } from '../../src/features/tasks/task-completion';
import { bottomTabScrollPadding } from '../../src/shared/ui/bottom-tab-layout';

const scopes = [
  { value: 'today', label: '今天' },
  { value: 'upcoming', label: '即将' },
  { value: 'overdue', label: '逾期' },
  { value: 'completed', label: '完成' },
] as const;
type Scope = (typeof scopes)[number]['value'];
type CompletionFeedback = {
  task: TaskSummary;
  recordId: string | null;
  canUndo: boolean;
};

export default function TasksTab() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { restoring, session, activeFamily } = useSession();
  const [scope, setScope] = useState<Scope>('today');
  const [tasks, setTasks] = useState<TaskSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState('');
  const [error, setError] = useState('');
  const [offlineNotice, setOfflineNotice] = useState('');
  const [completionFeedback, setCompletionFeedback] = useState<CompletionFeedback>();
  const [completingTask, setCompletingTask] = useState<TaskSummary>();
  const [completionError, setCompletionError] = useState('');
  const dismissCompletionFeedback = useCallback(() => setCompletionFeedback(undefined), []);

  const contextUnavailable = !restoring && (!session || !activeFamily);
  const interactionLocked = loading || Boolean(actionId) || Boolean(completingTask);

  const load = useCallback(async () => {
    if (restoring) return;
    if (!session || !activeFamily) {
      setTasks([]);
      setLoading(false);
      setError('');
      return;
    }
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
  }, [activeFamily, restoring, scope, session]);
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  function requestComplete(task: TaskSummary) {
    if (interactionLocked) return;
    setCompletionError('');
    setError('');
    setCompletingTask(task);
  }
  async function complete(task: TaskSummary, input: CompleteTaskInput) {
    if (!session || !activeFamily || actionId) return;
    setActionId(task.id);
    setError('');
    setCompletionError('');
    const operation = authApi.createCompleteOperation(activeFamily.id, task, input);
    try {
      const result = await authApi.sendTaskOperation(session.accessToken, operation);
      const completedTask = taskFromMutationResult(result, task);
      setCompletingTask(undefined);
      setCompletionFeedback({
        task: completedTask,
        recordId: recordIdFromTaskMutationResult(result),
        canUndo: canQuickUndoTaskCompletion(task),
      });
      await load();
    } catch (cause) {
      if (isNetworkFailure(cause)) {
        try {
          await enqueueOfflineOperation(operation);
          await removeCachedTask(task.id);
          setTasks((current) => current.filter((item) => item.id !== task.id));
          setOfflineNotice('网络不可用，完成操作已保存并将在恢复后同步');
          if (canQuickUndoTaskCompletion(task))
            setCompletionFeedback({
              task: optimisticCompletedTask(task, input.actualAt),
              recordId: null,
              canUndo: true,
            });
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
    if (interactionLocked) return;
    Alert.alert('跳过这次任务', '只会跳过本次任务，不会暂停长期计划。', [
      { text: '取消', style: 'cancel' },
      { text: '确认跳过', onPress: () => void skip(task) },
    ]);
  }
  async function skip(task: TaskSummary) {
    if (!session || !activeFamily || actionId) return;
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
    if (!session || !activeFamily || actionId) return;
    setActionId(task.id);
    setError('');
    const operation = authApi.createUndoOperation(activeFamily.id, task);
    try {
      await authApi.sendTaskOperation(session.accessToken, operation);
      if (quickUndo) dismissCompletionFeedback();
      await load();
    } catch (cause) {
      if (isNetworkFailure(cause)) {
        await enqueueOfflineOperation(operation);
        await removeCachedTask(task.id);
        if (quickUndo) {
          const pendingTask = optimisticPendingTask(task);
          setTasks((current) => [pendingTask, ...current.filter((item) => item.id !== task.id)]);
          dismissCompletionFeedback();
        } else setTasks((current) => current.filter((item) => item.id !== task.id));
        setOfflineNotice('网络不可用，撤销操作已保存并将在恢复后同步');
      } else {
        if (quickUndo) dismissCompletionFeedback();
        setError(cause instanceof AuthApiError ? cause.message : '撤销失败');
      }
    } finally {
      setActionId('');
    }
  }

  const canManagePlans = activeFamily?.role === 'OWNER' || activeFamily?.role === 'ADMIN';
  const canOpenPlanActions = canManagePlans && !interactionLocked && !contextUnavailable;
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
          <View style={styles.headingCopy}>
            <Text testID="tasks.title" style={styles.title}>
              照顾任务
            </Text>
            <Text style={styles.subtitle}>未来事项与历史结果清楚分开</Text>
          </View>
          {canManagePlans ? (
            <View style={styles.headerActions}>
              <Pressable
                testID="tasks.manage-plans.button"
                accessibilityRole="button"
                accessibilityState={{ disabled: !canOpenPlanActions }}
                disabled={!canOpenPlanActions}
                onPress={() => router.push('/plans')}
                style={({ pressed }) => [styles.headerButton, pressed && styles.pressed]}
              >
                <Text style={styles.headerButtonText}>管理计划</Text>
              </Pressable>
              <Pressable
                testID="tasks.create-plan.button"
                accessibilityRole="button"
                accessibilityState={{ disabled: !canOpenPlanActions }}
                disabled={!canOpenPlanActions}
                onPress={() => router.push('/plans/new')}
                style={({ pressed }) => [
                  styles.headerButton,
                  styles.headerButtonPrimary,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={styles.headerButtonTextPrimary}>新建计划</Text>
              </Pressable>
            </View>
          ) : null}
        </View>
        <View style={styles.segment}>
          {scopes.map((item) => (
            <Pressable
              key={item.value}
              testID={`tasks.scope.${item.value}`}
              accessibilityRole="button"
              accessibilityState={{ selected: scope === item.value, disabled: interactionLocked }}
              disabled={interactionLocked}
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
            disabled={!offlineNotice.includes('冲突') || interactionLocked}
            accessibilityState={{ disabled: !offlineNotice.includes('冲突') || interactionLocked }}
            onPress={() => router.push('/sync-conflicts')}
            style={styles.offlineNotice}
          >
            <Text style={styles.offlineNoticeText}>
              {offlineNotice}
              {offlineNotice.includes('冲突') ? ' · 点击处理' : ''}
            </Text>
          </Pressable>
        ) : null}
        {completionFeedback ? (
          <TaskUndoBanner
            task={completionFeedback.task}
            busy={actionId === completionFeedback.task.id}
            recordId={completionFeedback.recordId}
            onUndo={
              completionFeedback.canUndo
                ? () => void undo(completionFeedback.task, true)
                : undefined
            }
            onDismiss={dismissCompletionFeedback}
            onViewRecord={(recordId) =>
              router.push({ pathname: '/records/[id]', params: { id: recordId } })
            }
          />
        ) : null}
        {loading ? (
          <View testID="tasks.loading.card" style={styles.stateCard}>
            <ActivityIndicator color={colors.brand} />
            <Text style={styles.stateText}>正在加载照顾任务…</Text>
          </View>
        ) : contextUnavailable ? (
          <Card testID="tasks.context-empty.card">
            <Title>需要先完成家庭设置</Title>
            <Body>登录并选择家庭后，才能查看照顾任务和生成提醒。</Body>
            <TextButton label="去我的页面检查家庭" onPress={() => router.push('/(tabs)/me')} />
          </Card>
        ) : error ? (
          <Card testID="tasks.error.card">
            <Title>任务加载失败</Title>
            <ErrorText testID="tasks.error.text">{error}</ErrorText>
            <TextButton testID="tasks.reload.button" label="重新加载" onPress={() => void load()} />
          </Card>
        ) : tasks.length ? (
          <Card>
            {tasks.map((task) => (
              <View
                key={task.id}
                testID="tasks.item"
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
                  testID="tasks.item.detail"
                  accessibilityRole="button"
                  accessibilityLabel={`查看${task.title}详情`}
                  accessibilityState={{ disabled: Boolean(actionId) }}
                  disabled={Boolean(actionId)}
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
                    testID="tasks.item.undo"
                    accessibilityRole="button"
                    accessibilityState={{ disabled: Boolean(actionId) }}
                    disabled={Boolean(actionId)}
                    onPress={() => void undo(task)}
                    style={styles.action}
                  >
                    <Text style={styles.undo}>撤销</Text>
                  </Pressable>
                ) : (
                  <View style={styles.actions}>
                    <Pressable
                      testID="tasks.item.skip"
                      accessibilityRole="button"
                      accessibilityState={{ disabled: Boolean(actionId) }}
                      disabled={Boolean(actionId)}
                      onPress={() => requestSkip(task)}
                      style={styles.smallAction}
                    >
                      <Text style={styles.skip}>跳过</Text>
                    </Pressable>
                    <Pressable
                      testID="tasks.item.complete"
                      accessibilityRole="button"
                      accessibilityState={{ disabled: Boolean(actionId) }}
                      disabled={Boolean(actionId)}
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
                testID="tasks.empty.create-plan.button"
                accessibilityRole="button"
                accessibilityState={{ disabled: !canOpenPlanActions }}
                disabled={!canOpenPlanActions}
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
  heading: { gap: spacing.md },
  headingCopy: { gap: spacing.xs },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  title: { ...typography.h1, color: colors.ink },
  subtitle: { ...typography.secondary, color: colors.textSecondary },
  headerButton: {
    minHeight: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  headerButtonPrimary: { borderColor: colors.brandSoft, backgroundColor: colors.brandSoft },
  headerButtonText: { fontSize: 13, fontWeight: '600', color: colors.ink },
  headerButtonTextPrimary: { fontSize: 13, fontWeight: '700', color: colors.brand },
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
  stateCard: {
    minHeight: 120,
    borderRadius: radii.card,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    padding: spacing.lg,
  },
  stateText: { ...typography.caption, color: colors.textSecondary },
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
  pressed: { opacity: 0.72, transform: [{ scale: 0.98 }] },
});
