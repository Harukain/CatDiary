import { describe, expect, it } from 'vitest';
import taskDetailSource from '../../../app/tasks/[id].tsx?raw';

describe('task detail footer actions', () => {
  it('keeps task detail actions fixed and safe-area aware', () => {
    expect(taskDetailSource).toContain('useSafeAreaInsets');
    expect(taskDetailSource).toContain('keyboardShouldPersistTaps="handled"');
    expect(taskDetailSource).toContain('testID="task-detail.footer"');
    expect(taskDetailSource).toContain('testID="task-detail.skip.button"');
    expect(taskDetailSource).toContain('testID="task-detail.complete.button"');
    expect(taskDetailSource).toContain('testID="task-detail.undo.button"');
    expect(taskDetailSource).toContain('testID="task-detail.return.button"');
    expect(taskDetailSource).toContain(
      'paddingBottom: Math.max(spacing.md, insets.bottom + spacing.sm)',
    );
    expect(taskDetailSource).toContain('content: { gap: spacing.xxl, paddingBottom: spacing.xl }');
  });

  it('exits initial loading when route or session context is missing', () => {
    expect(taskDetailSource).toContain(
      'const contextUnavailable = !restoring && (!id || !session || !activeFamily);',
    );
    expect(taskDetailSource).toContain('setTask(undefined);');
    expect(taskDetailSource).toContain('setLoading(false);');
    expect(taskDetailSource).toContain('testID="task-detail.context-empty"');
    expect(taskDetailSource).toContain('testID="task-detail.loading"');
  });

  it('locks complete, skip and undo while a task mutation is running', () => {
    expect(taskDetailSource).toContain(
      'const interactionDisabled = actionBusy || loadingInitial || contextUnavailable;',
    );
    expect(taskDetailSource).toContain('disabled={interactionDisabled}');
    expect(taskDetailSource).toContain('if (!task || interactionDisabled) return;');
    expect(taskDetailSource).toContain(
      'if (!task || !session || !activeFamily || actionBusy) return;',
    );
    expect(taskDetailSource).toContain('accessibilityState={{ disabled: actionBusy }}');
  });

  it('does not leave the primary return action at the bottom of scroll content', () => {
    expect(taskDetailSource).not.toContain(
      "<TextButton label={actionBusy ? '处理中，请等待' : '返回'} onPress={requestReturn} />",
    );
    expect(taskDetailSource).not.toContain(
      'content: { gap: spacing.xxl, paddingBottom: spacing.xxxl }',
    );
  });
});
