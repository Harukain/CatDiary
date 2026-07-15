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
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
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
  enqueueOfflineOperation,
  isNetworkFailure,
  removeCachedTask,
} from '../../src/features/offline/offline-queue';
import { TaskCompletionSheet } from '../../src/features/tasks/task-completion-sheet';
import {
  formatTaskCompletionResult,
  isMedicalTask,
} from '../../src/features/tasks/task-completion';
import { resolveDraftExitDecision } from '../../src/shared/navigation/draft-exit';

export default function TaskDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { session, activeFamily } = useSession();
  const [task, setTask] = useState<TaskSummary>();
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [actionBusy, setActionBusy] = useState(false);
  const [completionVisible, setCompletionVisible] = useState(false);

  const load = useCallback(() => {
    if (!id || !session || !activeFamily) return;
    setError('');
    void authApi
      .getTask(session.accessToken, activeFamily.id, id)
      .then(setTask)
      .catch((cause) =>
        setError(cause instanceof AuthApiError ? cause.message : '任务详情加载失败'),
      );
  }, [activeFamily, id, session]);

  useFocusEffect(
    useCallback(() => {
      load();
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
    if (!task) return;
    setCompletionVisible(true);
  }

  async function complete(input: CompleteTaskInput) {
    if (!task || !session || !activeFamily) return;
    setCompletionVisible(false);
    setActionBusy(true);
    setError('');
    setNotice('');
    const operation = authApi.createCompleteOperation(activeFamily.id, task, input);
    try {
      await authApi.sendTaskOperation(session.accessToken, operation);
      load();
    } catch (cause) {
      if (isNetworkFailure(cause)) {
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
        setNotice('网络不可用，完成操作已保存并将在恢复后同步。');
      } else setError(cause instanceof AuthApiError ? cause.message : '任务完成失败');
    } finally {
      setActionBusy(false);
    }
  }

  function requestSkip() {
    if (!task) return;
    Alert.alert('跳过这次任务', '只会跳过本次任务，不会暂停长期计划。', [
      { text: '取消', style: 'cancel' },
      { text: '确认跳过', onPress: () => void skip() },
    ]);
  }

  async function skip() {
    if (!task || !session || !activeFamily) return;
    setActionBusy(true);
    setError('');
    setNotice('');
    const operation = authApi.createSkipOperation(activeFamily.id, task);
    try {
      await authApi.sendTaskOperation(session.accessToken, operation);
      load();
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
    if (!task || !session || !activeFamily) return;
    setActionBusy(true);
    setError('');
    setNotice('');
    const operation = authApi.createUndoOperation(activeFamily.id, task);
    try {
      await authApi.sendTaskOperation(session.accessToken, operation);
      load();
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

  if (!task && !error)
    return (
      <Screen>
        <ActivityIndicator color={colors.brand} />
      </Screen>
    );
  if (!task)
    return (
      <Screen>
        <ErrorText>{error}</ErrorText>
        <TextButton label="返回任务列表" onPress={() => router.replace('/(tabs)/tasks')} />
      </Screen>
    );

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
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
                ? '医疗任务完成前需要再次确认实际执行情况。'
                : '完成会记录实际时间与执行人；跳过只影响本次任务。'
              : canUndo(task)
                ? '如需更正结果，可以撤销后重新处理本次任务。'
                : '该任务已取消，不能再继续处理。'}
          </Body>
          {error ? <ErrorText>{error}</ErrorText> : null}
          {notice ? <Text style={styles.notice}>{notice}</Text> : null}
          {actionBusy ? (
            <ActivityIndicator color={colors.brand} />
          ) : task.status === 'PENDING' ? (
            <View style={styles.actions}>
              <Pressable
                accessibilityRole="button"
                onPress={requestSkip}
                style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}
              >
                <Text style={styles.secondaryText}>跳过本次</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={requestComplete}
                style={({ pressed }) => [styles.primary, pressed && styles.pressed]}
              >
                <Text style={styles.primaryText}>完成任务</Text>
              </Pressable>
            </View>
          ) : canUndo(task) ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => void undo()}
              style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}
            >
              <Text style={styles.secondaryText}>撤销本次结果</Text>
            </Pressable>
          ) : (
            <Text style={styles.inactiveHint}>无需进行操作</Text>
          )}
        </Card>
        <TextButton label={actionBusy ? '处理中，请等待' : '返回'} onPress={requestReturn} />
      </ScrollView>
      <TaskCompletionSheet
        task={task}
        visible={completionVisible}
        busy={actionBusy}
        onCancel={() => setCompletionVisible(false)}
        onSubmit={(input) => void complete(input)}
      />
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
  content: { gap: spacing.xxl, paddingBottom: spacing.xxxl },
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
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
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
  inactiveHint: { ...typography.caption, color: colors.textTertiary },
  pressed: { opacity: 0.75, transform: [{ scale: 0.97 }] },
});
