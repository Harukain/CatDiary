import { useEffect, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radii, spacing, typography } from '@cat-diary/design-tokens';
import type { CompleteTaskInput, TaskSummary } from '../auth/auth-api';
import { resolveDraftExitDecision } from '../../shared/navigation/draft-exit';
import { ErrorText, Field, PrimaryButton, TextButton } from '../../shared/ui/primitives';
import {
  buildTaskCompletionInput,
  initialTaskCompletionDraft,
  isTaskCompletionDraftDirty,
  isMedicalTask,
  type TaskCompletionDraft,
} from './task-completion';

interface TaskCompletionSheetProps {
  task?: TaskSummary;
  visible: boolean;
  busy?: boolean;
  submissionError?: string;
  onCancel(): void;
  onSubmit(input: CompleteTaskInput): void;
}

export function TaskCompletionSheet({
  task,
  visible,
  busy,
  submissionError,
  onCancel,
  onSubmit,
}: TaskCompletionSheetProps) {
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState<TaskCompletionDraft>(() =>
    initialTaskCompletionDraft(task ?? { type: 'LITTER' }),
  );
  const [baselineDraft, setBaselineDraft] = useState<TaskCompletionDraft>(() =>
    initialTaskCompletionDraft(task ?? { type: 'LITTER' }),
  );
  const [error, setError] = useState('');

  useEffect(() => {
    if (visible && task) {
      const nextDraft = initialTaskCompletionDraft(task);
      setDraft(nextDraft);
      setBaselineDraft(nextDraft);
      setError('');
    }
  }, [task, visible]);

  useEffect(() => {
    if (visible && submissionError) setError(submissionError);
  }, [submissionError, visible]);

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

  function requestCancel() {
    const decision = resolveDraftExitDecision({
      busy: !!busy,
      isDirty: isTaskCompletionDraftDirty(draft, baselineDraft),
    });
    if (decision === 'wait') {
      Alert.alert('任务完成正在保存', '请等待当前完成结果保存完成，避免任务和记录状态不一致。', [
        { text: '继续等待', style: 'cancel' },
      ]);
      return;
    }
    if (decision === 'continue') {
      onCancel();
      return;
    }
    Alert.alert(
      '放弃完成草稿？',
      '你填写的实际时间、执行结果或备注尚未保存，离开后需要重新填写。',
      [
        { text: '继续填写', style: 'cancel' },
        { text: '放弃', style: 'destructive', onPress: onCancel },
      ],
    );
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={requestCancel}
      statusBarTranslucent
    >
      <View accessibilityViewIsModal style={styles.root}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="关闭完成任务面板"
          accessibilityHint={busy ? '完成结果保存中，点击会提示继续等待' : '关闭完成任务面板'}
          onPress={requestCancel}
          style={StyleSheet.absoluteFill}
        />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.keyboard}
        >
          <ScrollView
            contentContainerStyle={[
              styles.sheet,
              { paddingBottom: Math.max(spacing.xxxl, insets.bottom + spacing.xl) },
            ]}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.handle} />
            <View style={styles.heading}>
              <View style={styles.headingCopy}>
                <Text testID="task-completion.sheet.title" style={styles.title}>
                  完成任务
                </Text>
                <Text style={styles.subtitle}>
                  {task.pet?.name ?? '家庭公共任务'} · {task.title}
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="关闭"
                accessibilityHint={busy ? '完成结果保存中，点击会提示继续等待' : '关闭完成任务面板'}
                onPress={requestCancel}
                style={({ pressed }) => [
                  styles.close,
                  busy && styles.closeBusy,
                  pressed && styles.pressed,
                ]}
              >
                <Ionicons name="close" size={20} color={busy ? colors.textTertiary : colors.ink} />
              </Pressable>
            </View>
            {medical ? (
              <View style={styles.warning}>
                <Text style={styles.warningText}>
                  请按实际执行情况填写。本记录仅用于家庭照护留痕，不能替代兽医建议。
                </Text>
              </View>
            ) : null}
            <Field
              testID="task-completion.actual-at.input"
              label="实际完成时间"
              value={draft.actualAtLocal}
              onChangeText={(value) => update('actualAtLocal', value)}
              placeholder="YYYY-MM-DD HH:mm"
              keyboardType="numbers-and-punctuation"
              maxLength={16}
              editable={!busy}
            />
            <Field
              testID="task-completion.result.input"
              label="执行结果"
              value={draft.resultText}
              onChangeText={(value) => update('resultText', value)}
              placeholder="例如：已清理，状态正常"
              maxLength={160}
              editable={!busy}
            />
            <Field
              testID="task-completion.note.input"
              label="备注"
              value={draft.note}
              onChangeText={(value) => update('note', value)}
              placeholder="选填，可记录反应、异常或补充说明"
              maxLength={500}
              multiline
              editable={!busy}
            />
            {error ? <ErrorText>{error}</ErrorText> : null}
            <PrimaryButton
              testID="task-completion.submit.button"
              label="保存完成结果"
              busy={busy}
              onPress={submit}
            />
            <TextButton
              testID="task-completion.cancel.button"
              label={busy ? '保存中，请等待' : '取消'}
              onPress={requestCancel}
            />
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
    gap: spacing.lg,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
  },
  heading: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  headingCopy: { flex: 1, gap: spacing.xs },
  title: { ...typography.h2, color: colors.ink },
  subtitle: { ...typography.secondary, color: colors.textSecondary },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  closeBusy: { opacity: 0.55 },
  pressed: { opacity: 0.72, transform: [{ scale: 0.97 }] },
  warning: {
    borderRadius: radii.banner,
    backgroundColor: colors.warningSoft,
    padding: spacing.md,
  },
  warningText: { ...typography.caption, color: colors.warningDark },
});
