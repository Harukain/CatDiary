import { describe, expect, it } from 'vitest';
import linkRecordSource from '../../../app/health-events/link-record.tsx?raw';

describe('health event record linking footer', () => {
  it('keeps record linking actions fixed and safe-area aware', () => {
    expect(linkRecordSource).toContain('useSafeAreaInsets');
    expect(linkRecordSource).toContain('keyboardShouldPersistTaps="handled"');
    expect(linkRecordSource).toContain('testID="health-event-link.footer"');
    expect(linkRecordSource).toContain('testID="health-event-link.reload.button"');
    expect(linkRecordSource).toContain('testID="health-event-link.return.button"');
    expect(linkRecordSource).toContain(
      'paddingBottom: Math.max(spacing.md, insets.bottom + spacing.sm)',
    );
    expect(linkRecordSource).toContain('content: { gap: spacing.xl, paddingBottom: spacing.xl }');
  });

  it('exits initial loading when route or session context is missing', () => {
    expect(linkRecordSource).toContain(
      'const contextUnavailable = !restoring && (!session || !activeFamily || !eventId);',
    );
    expect(linkRecordSource).toContain('setEvent(undefined);');
    expect(linkRecordSource).toContain('setRecords([]);');
    expect(linkRecordSource).toContain('setLoading(false);');
    expect(linkRecordSource).toContain('testID="health-event-link.context-empty"');
  });

  it('locks linking controls while loading or mutating relation state', () => {
    expect(linkRecordSource).toContain(
      'const interactionDisabled = busy || loading || contextUnavailable;',
    );
    expect(linkRecordSource).toContain('accessibilityState={{ disabled: busy }}');
    expect(linkRecordSource).toContain('disabled={interactionDisabled}');
    expect(linkRecordSource).toContain(
      'if (!session || !activeFamily || !event || interactionDisabled) return;',
    );
  });
});
