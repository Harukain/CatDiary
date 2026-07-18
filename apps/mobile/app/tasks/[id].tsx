import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radii, spacing, typography } from '@cat-diary/design-tokens';
import {
  authApi,
  AuthApiError,
  type CompleteTaskInput,
  type TaskSummary,
} from '../../src/features/auth/auth-api';
import { useSession } from '../../src/features/auth/session-provider';
import {
  Body,
  Card,
  ErrorText,
  PrimaryButton,
  Screen,
  TextButton,
  Title,
} from '../../src/shared/ui/primitives';
import {
  enqueueOfflineOperation,
  isNetworkFailure,
  removeCachedTask,
} from '../../src/features/offline/offline-queue';
import { TaskCompletionSheet } from '../../src/features/tasks/task-completion-sheet';
import {
  formatTaskCompletionResult,
  isMedicalTask,
} from '../../src/features/tasks/task-completion';
import {
  recordIdFromTaskMutationResult,
  taskFromMutationResult,
} from '../../src/features/tasks/task-mutation';
import { resolveDraftExitDecision } from '../../src/shared/navigation/draft-exit';

export default function TaskDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { restoring, session, activeFamily } = useSession();
  const [task, setTask] = useState<TaskSummary>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [actionBusy, setActionBusy] = useState(false);
  const [completionVisible, setCompletionVisible] = useState(false);
  const [completionError, setCompletionError] = useState('');
  const [generatedRecordId, setGeneratedRecordId] = useState('');

  const contextUnavailable = !restoring && (!id || !session || !activeFamily);
  const loadingInitial = restoring || (loading && !task);
  const interactionDisabled = actionBusy || loadingInitial || contextUnavailable;

  const load = useCallback(async () => {
    if (restoring) return;
    if (!id || !session || !activeFamily) {
      setTask(undefined);
      setLoading(false);
      setError('');
      return;
    }
    setLoading(true);
    setError('');
    try {
      setTask(await authApi.getTask(session.accessToken, activeFamily.id, id));
    } catch (cause) {
      setError(cause instanceof AuthApiError ? cause.message : '任务详情加载失败');
      setTask(undefined);
    } finally {
      setLoading(false);
    }
  }, [activeFamily, id, restoring, session]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const requestReturn = useCallback(() => {
    const decision = resolveDraftExitDecision({ busy: actionBusy, isDirty: false });
    if (decision === 'wait') {
      Alert.alert(
        '任务正在处理',
        '请等待当前完成、跳过或撤销操作完成，避免任务和记录状态不一致。',
        [{ text: '继续等待', style: 'cancel' }],
      );
      return;
    }
    router.back();
  }, [actionBusy, router]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      const decision = resolveDraftExitDecision({ busy: actionBusy, isDirty: false });
      if (decision === 'continue') return false;
      requestReturn();
      return true;
    });
    return () => subscription.remove();
  }, [actionBusy, requestReturn]);

  function requestComplete() {
    if (!task || interactionDisabled) return;
    setCompletionError('');
    setError('');
    setCompletionVisible(true);
  }

  async function complete(input: CompleteTaskInput) {
    if (!task || !session || !activeFamily || actionBusy) return;
    setActionBusy(true);
    setError('');
    setCompletionError('');
    setNotice('');
    const operation = authApi.createCompleteOperation(activeFamily.id, task, input);
    try {
      const result = await authApi.sendTaskOperation(session.accessToken, operation);
      const recordId = recordIdFromTaskMutationResult(result);
      const completedTask = taskFromMutationResult(result, task);
      setTask({
        ...completedTask,
        record: recordId ? { id: recordId } : completedTask.record,
      });
      setGeneratedRecordId(recordId ?? '');
      setNotice(recordId ? '完成结果已保存，已生成对应记录。' : '完成结果已保存。');
      setCompletionVisible(false);
      void load();
    } catch (cause) {
      if (isNetworkFailure(cause)) {
        try {
          await enqueueOfflineOperation(operation);
          await removeCachedTask(task.id);
          setTask({
            ...task,
            status: 'COMPLETED',
            completedAt: input.actualAt,
            result: input.result,
            note: input.note ?? null,
            version: task.version + 1,
          });
          setCompletionVisible(false);
          setNotice('网络不可用，完成操作已保存并将在恢复后同步。');
        } catch {
          setCompletionError('离线操作保存失败，请稍后重试');
        }
      } else setCompletionError(cause instanceof AuthApiError ? cause.message : '任务完成失败');
    } finally {
      setActionBusy(false);
    }
  }

  function requestSkip() {
    if (!task || interactionDisabled) return;
    Alert.alert('跳过这次任务', '只会跳过本次任务，不会暂停长期计划。', [
      { text: '取消', style: 'cancel' },
      { text: '确认跳过', onPress: () => void skip() },
    ]);
  }

  async function skip() {
    if (!task || !session || !activeFamily || actionBusy) return;
    setActionBusy(true);
    setError('');
    setNotice('');
    setGeneratedRecordId('');
    const operation = authApi.createSkipOperation(activeFamily.id, task);
    try {
      await authApi.sendTaskOperation(session.accessToken, operation);
      void load();
    } catch (cause) {
      if (isNetworkFailure(cause)) {
        await enqueueOfflineOperation(operation);
        await removeCachedTask(task.id);
        setTask({ ...task, status: 'SKIPPED' });
        setNotice('网络不可用，跳过操作已保存并将在恢复后同步。');
      } else setError(cause instanceof AuthApiError ? cause.message : '跳过失败');
    } finally {
      setActionBusy(false);
    }
  }

  async function undo() {
    if (!task || !session || !activeFamily || actionBusy) return;
    setActionBusy(true);
    setError('');
    setNotice('');
    setGeneratedRecordId('');
    const operation = authApi.createUndoOperation(activeFamily.id, task);
    try {
      await authApi.sendTaskOperation(session.accessToken, operation);
      void load();
    } catch (cause) {
      if (isNetworkFailure(cause)) {
        await enqueueOfflineOperation(operation);
        await removeCachedTask(task.id);
        setTask({ ...task, status: 'PENDING', completedAt: null });
        setNotice('网络不可用，撤销操作已保存并将在恢复后同步。');
      } else setError(cause instanceof AuthApiError ? cause.message : '撤销失败');
    } finally {
      setActionBusy(false);
    }
  }

  const linkedRecordId = task
    ? generatedRecordId ||
      (task.status === 'COMPLETED' && typeof task.record?.id === 'string' ? task.record.id : '')
    : '';
  const returnLabel = task ? '返回上一页' : '返回任务列表';
  const returnAction = task ? requestReturn : () => router.replace('/(tabs)/tasks');

  return (
    <Screen>
      <Stack.Screen options={{ gestureEnabled: false }} />
      <View style={styles.flex}>
        <View style={styles.nav}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="返回"
            accessibilityHint={actionBusy ? '任务操作处理中，点击会提示继续等待' : returnLabel}
            accessibilityState={{ disabled: actionBusy }}
            disabled={actionBusy}
            onPress={requestReturn}
            style={({ pressed }) => [
              styles.navButton,
              actionBusy && styles.disabled,
              pressed && styles.pressed,
            ]}
          >
            <Ionicons name="chevron-back" size={22} color={colors.ink} />
          </Pressable>
          <Text style={styles.navTitle}>任务详情</Text>
          <View style={styles.navButton} />
        </View>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {loadingInitial ? (
            <View testID="task-detail.loading" style={styles.stateCard}>
              <ActivityIndicator color={colors.brand} />
              <Body>正在读取任务详情。</Body>
            </View>
          ) : contextUnavailable ? (
            <Card testID="task-detail.context-empty">
              <Title>缺少任务上下文</Title>
              <Body>请从任务列表重新进入详情页，确保当前家庭和任务信息有效。</Body>
            </Card>
          ) : !task ? (
            <Card testID="task-detail.error.card">
              <ErrorText testID="task-detail.error.text">{error || '任务详情加载失败'}</ErrorText>
              <Body>可以重新加载任务详情；如果任务已被取消或删除，请返回任务列表确认。</Body>
            </Card>
          ) : (
            <>
              <View style={styles.heading}>
                <Text style={styles.eyebrow}>照顾任务 · {typeLabel(task.type)}</Text>
                <Text style={styles.title}>{task.title}</Text>
                <View style={[styles.badge, statusStyle(task.status)]}>
                  <Text style={styles.badgeText}>{statusLabel(task.status)}</Text>
                </View>
              </View>
              <Card>
                <Title>任务信息</Title>
                <Info label="猫咪" value={task.pet?.name ?? '家庭公共任务'} />
                <Info
                  label="计划时间"
                  value={new Date(task.scheduledAt).toLocaleString('zh-CN', { hour12: false })}
                />
                <Info label="负责人" value={task.assignee?.displayName ?? '家庭成员共同负责'} />
                {task.detail ? <Info label="说明" value={task.detail} /> : null}
                {task.completedAt ? (
                  <Info
                    label="完成时间"
                    value={new Date(task.completedAt).toLocaleString('zh-CN', { hour12: false })}
                  />
                ) : null}
                {formatTaskCompletionResult(task.result) ? (
                  <Info label="执行结果" value={formatTaskCompletionResult(task.result)} />
                ) : null}
                {task.note ? <Info label="备注" value={task.note} /> : null}
              </Card>
              <Card>
                <Title>{task.status === 'PENDING' ? '处理任务' : '任务结果'}</Title>
                <Body>
                  {task.status === 'PENDING'
                    ? isMedicalTask(task)
                      ? '医疗任务完成前需要再次确认实际执行情况。底部按钮会打开完成确认面板。'
                      : '完成会记录实际时间与执行人；跳过只影响本次任务。'
                    : canUndo(task)
                      ? '如需更正结果，可以撤销后重新处理本次任务。'
                      : '该任务已取消，不能再继续处理。'}
                </Body>
                {error ? (
                  <ErrorText testID="task-detail.action-error.text">{error}</ErrorText>
                ) : null}
                {notice ? <Text style={styles.notice}>{notice}</Text> : null}
                {linkedRecordId ? (
                  <Pressable
                    testID="task-detail.view-record.button"
                    accessibilityRole="button"
                    accessibilityLabel={`查看${task.title}生成的记录`}
                    disabled={actionBusy}
                    onPress={() =>
                      router.push({ pathname: '/records/[id]', params: { id: linkedRecordId } })
                    }
                    style={({ pressed }) => [
                      styles.recordLink,
                      actionBusy && styles.disabled,
                      pressed && styles.pressed,
                    ]}
                  >
                    <View style={styles.recordLinkCopy}>
                      <Text style={styles.recordLinkTitle}>查看对应记录</Text>
                      <Text style={styles.recordLinkBody}>
                        这里保存了实际完成时间、执行结果和备注。
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={colors.successDark} />
                  </Pressable>
                ) : null}
                {actionBusy ? <ActivityIndicator color={colors.brand} /> : null}
                {!actionBusy && task.status === 'CANCELLED' ? (
                  <Text style={styles.inactiveHint}>无需进行操作</Text>
                ) : null}
              </Card>
            </>
          )}
        </ScrollView>
        <View
          testID="task-detail.footer"
          style={[
            styles.footer,
            { paddingBottom: Math.max(spacing.md, insets.bottom + spacing.sm) },
          ]}
        >
          {task?.status === 'PENDING' ? (
            <View style={styles.footerActions}>
              <Pressable
                testID="task-detail.skip.button"
                accessibilityRole="button"
                accessibilityLabel="跳过本次任务"
                accessibilityState={{ disabled: interactionDisabled }}
                disabled={interactionDisabled}
                onPress={requestSkip}
                style={({ pressed }) => [
                  styles.secondary,
                  interactionDisabled && styles.disabled,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={styles.secondaryText}>跳过本次</Text>
              </Pressable>
              <Pressable
                testID="task-detail.complete.button"
                accessibilityRole="button"
                accessibilityLabel="完成任务"
                accessibilityState={{ disabled: interactionDisabled }}
                disabled={interactionDisabled}
                onPress={requestComplete}
                style={({ pressed }) => [
                  styles.primary,
                  interactionDisabled && styles.disabled,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={styles.primaryText}>完成任务</Text>
              </Pressable>
            </View>
          ) : task && canUndo(task) ? (
            <PrimaryButton
              testID="task-detail.undo.button"
              label="撤销本次结果"
              busy={actionBusy}
              disabled={loadingInitial}
              onPress={() => void undo()}
            />
          ) : !task && error && !contextUnavailable ? (
            <PrimaryButton
              testID="task-detail.reload.button"
              label="重新加载任务"
              busy={loading}
              onPress={() => void load()}
            />
          ) : null}
          <TextButton
            testID="task-detail.return.button"
            label={actionBusy ? '处理中，请等待' : returnLabel}
            disabled={actionBusy}
            onPress={returnAction}
          />
        </View>
      </View>
      {task ? (
        <TaskCompletionSheet
          task={task}
          visible={completionVisible}
          busy={actionBusy}
          submissionError={completionError}
          onCancel={() => {
            setCompletionError('');
            setCompletionVisible(false);
          }}
          onSubmit={(input) => void complete(input)}
        />
      ) : null}
    </Screen>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.info}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
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
function statusLabel(status: TaskSummary['status']) {
  return { PENDING: '待处理', COMPLETED: '已完成', SKIPPED: '已跳过', CANCELLED: '已取消' }[status];
}
function statusStyle(status: TaskSummary['status']) {
  return status === 'PENDING'
    ? styles.pending
    : status === 'COMPLETED'
      ? styles.completed
      : styles.inactive;
}
function canUndo(task: TaskSummary) {
  return task.status === 'COMPLETED' || task.status === 'SKIPPED';
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  nav: {
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  navButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  navTitle: { ...typography.h2, color: colors.ink },
  scroll: { flex: 1 },
  content: { gap: spacing.xxl, paddingBottom: spacing.xl },
  stateCard: {
    padding: spacing.xl,
    borderRadius: radii.card,
    backgroundColor: colors.surface,
    alignItems: 'center',
    gap: spacing.md,
  },
  heading: { gap: spacing.sm, alignItems: 'flex-start' },
  eyebrow: { ...typography.secondary, color: colors.brand, fontWeight: '600' },
  title: { ...typography.h1, color: colors.ink },
  badge: { borderRadius: radii.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  pending: { backgroundColor: colors.brandSoft },
  completed: { backgroundColor: colors.successSoft },
  inactive: { backgroundColor: colors.divider },
  badgeText: { fontSize: 12, fontWeight: '600', color: colors.ink },
  info: { gap: spacing.xs, paddingTop: spacing.md },
  label: { ...typography.secondary, color: colors.textSecondary },
  value: { ...typography.body, color: colors.ink },
  footerActions: { flexDirection: 'row', gap: spacing.sm },
  primary: {
    flex: 1,
    minHeight: 48,
    borderRadius: radii.input,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryText: { color: colors.surface, fontWeight: '700' },
  secondary: {
    flex: 1,
    minHeight: 48,
    borderRadius: radii.input,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryText: { color: colors.ink, fontWeight: '600' },
  notice: { ...typography.caption, color: colors.warningDark },
  recordLink: {
    minHeight: 64,
    borderRadius: radii.input,
    backgroundColor: colors.successSoft,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  recordLinkCopy: { flex: 1, gap: spacing.xs },
  recordLinkTitle: { ...typography.h3, color: colors.successDark },
  recordLinkBody: { ...typography.caption, color: colors.successDark },
  inactiveHint: { ...typography.caption, color: colors.textTertiary },
  footer: {
    paddingTop: spacing.md,
    paddingHorizontal: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    backgroundColor: colors.page,
    gap: spacing.xs,
  },
  disabled: { opacity: 0.55 },
  pressed: { opacity: 0.75, transform: [{ scale: 0.97 }] },
});
