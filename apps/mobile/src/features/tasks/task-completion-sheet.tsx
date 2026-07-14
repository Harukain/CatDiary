import { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { colors, radii, spacing, typography } from '@cat-diary/design-tokens';
import type { CompleteTaskInput, TaskSummary } from '../auth/auth-api';
import { ErrorText, Field, PrimaryButton, TextButton } from '../../shared/ui/primitives';
import {
  buildTaskCompletionInput,
  initialTaskCompletionDraft,
  isMedicalTask,
  type TaskCompletionDraft,
} from './task-completion';

interface TaskCompletionSheetProps {
  task?: TaskSummary;
  visible: boolean;
  busy?: boolean;
  onCancel(): void;
  onSubmit(input: CompleteTaskInput): void;
}

export function TaskCompletionSheet({
  task,
  visible,
  busy,
  onCancel,
  onSubmit,
}: TaskCompletionSheetProps) {
  const [draft, setDraft] = useState<TaskCompletionDraft>(() =>
    initialTaskCompletionDraft(task ?? { type: 'LITTER' }),
  );
  const [error, setError] = useState('');

  useEffect(() => {
    if (visible && task) {
      setDraft(initialTaskCompletionDraft(task));
      setError('');
    }
  }, [task, visible]);

  if (!task) return null;
  const medical = isMedicalTask(task);

  function update<Key extends keyof TaskCompletionDraft>(
    key: Key,
    value: TaskCompletionDraft[Key],
  ) {
    setDraft((current) => ({ ...current, [key]: value }));
    if (error) setError('');
  }

  function submit() {
    if (!task) return;
    const validation = buildTaskCompletionInput(task, draft);
    if (!validation.input) {
      setError(validation.error ?? '请检查完成信息');
      return;
    }
    onSubmit(validation.input);
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <View style={styles.root}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="关闭完成任务面板"
          disabled={busy}
          onPress={onCancel}
          style={StyleSheet.absoluteFill}
        />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.keyboard}
        >
          <ScrollView contentContainerStyle={styles.sheet} keyboardShouldPersistTaps="handled">
            <View style={styles.handle} />
            <View style={styles.heading}>
              <Text style={styles.title}>完成任务</Text>
              <Text style={styles.subtitle}>
                {task.pet?.name ?? '家庭公共任务'} · {task.title}
              </Text>
            </View>
            {medical ? (
              <View style={styles.warning}>
                <Text style={styles.warningText}>
                  请按实际执行情况填写。本记录仅用于家庭照护留痕，不能替代兽医建议。
                </Text>
              </View>
            ) : null}
            <Field
              label="实际完成时间"
              value={draft.actualAtLocal}
              onChangeText={(value) => update('actualAtLocal', value)}
              placeholder="YYYY-MM-DD HH:mm"
              keyboardType="numbers-and-punctuation"
              maxLength={16}
            />
            <Field
              label="执行结果"
              value={draft.resultText}
              onChangeText={(value) => update('resultText', value)}
              placeholder="例如：已清理，状态正常"
              maxLength={160}
            />
            <Field
              label="备注"
              value={draft.note}
              onChangeText={(value) => update('note', value)}
              placeholder="选填，可记录反应、异常或补充说明"
              maxLength={500}
              multiline
            />
            {error ? <ErrorText>{error}</ErrorText> : null}
            <PrimaryButton label="保存完成结果" busy={busy} onPress={submit} />
            <TextButton label="取消" disabled={busy} onPress={onCancel} />
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: colors.overlay,
  },
  keyboard: { justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.page,
    borderTopLeftRadius: radii.navigation,
    borderTopRightRadius: radii.navigation,
    padding: spacing.xl,
    paddingBottom: spacing.xxxl,
    gap: spacing.lg,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
  },
  heading: { gap: spacing.xs },
  title: { ...typography.h2, color: colors.ink },
  subtitle: { ...typography.secondary, color: colors.textSecondary },
  warning: {
    borderRadius: radii.banner,
    backgroundColor: colors.warningSoft,
    padding: spacing.md,
  },
  warningText: { ...typography.caption, color: colors.warningDark },
});
