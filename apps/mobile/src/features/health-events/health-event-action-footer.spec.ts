import { describe, expect, it } from 'vitest';
import healthEventDetailSource from '../../../app/health-events/[id].tsx?raw';
import newHealthEventSource from '../../../app/health-events/new.tsx?raw';

describe('health event bottom actions', () => {
  it('keeps new health event actions fixed and keyboard-safe', () => {
    expect(newHealthEventSource).toContain('KeyboardAvoidingView');
    expect(newHealthEventSource).toContain('Keyboard.addListener');
    expect(newHealthEventSource).toContain('useSafeAreaInsets');
    expect(newHealthEventSource).toContain('keyboardShouldPersistTaps="handled"');
    expect(newHealthEventSource).toContain('testID="health-event-new.footer"');
    expect(newHealthEventSource).toContain('testID="health-event-new.submit.button"');
    expect(newHealthEventSource).toContain('testID="health-event-new.cancel.button"');
    expect(newHealthEventSource).toContain('testID="health-event-new.submit.inline-button"');
    expect(newHealthEventSource).toContain('testID="health-event-new.cancel.inline-button"');
    expect(newHealthEventSource).toContain(
      'paddingBottom: Math.max(spacing.md, insets.bottom + spacing.sm)',
    );
  });

  it('keeps health event detail actions fixed and safe-area aware', () => {
    expect(healthEventDetailSource).toContain('KeyboardAvoidingView');
    expect(healthEventDetailSource).toContain('Keyboard.addListener');
    expect(healthEventDetailSource).toContain('useSafeAreaInsets');
    expect(healthEventDetailSource).toContain('keyboardShouldPersistTaps="handled"');
    expect(healthEventDetailSource).toContain('testID="health-event-detail.footer"');
    expect(healthEventDetailSource).toContain('testID="health-event-detail.save.button"');
    expect(healthEventDetailSource).toContain('testID="health-event-detail.recover.button"');
    expect(healthEventDetailSource).toContain('testID="health-event-detail.return.button"');
    expect(healthEventDetailSource).toContain('testID="health-event-detail.save.inline-button"');
    expect(healthEventDetailSource).toContain(
      'paddingBottom: Math.max(spacing.md, insets.bottom + spacing.sm)',
    );
  });

  it('shows explicit restoration, missing context, and load failure states on health event detail', () => {
    expect(healthEventDetailSource).toContain(
      'const { restoring, session, activeFamily } = useSession();',
    );
    expect(healthEventDetailSource).toContain('const [loading, setLoading] = useState(true);');
    expect(healthEventDetailSource).toContain(
      'const contextUnavailable = !restoring && (!session || !activeFamily || !eventId);',
    );
    expect(healthEventDetailSource).toContain(
      'const loadingInitial = restoring || (loading && !event);',
    );
    expect(healthEventDetailSource).toContain('testID="health-event-detail.loading.card"');
    expect(healthEventDetailSource).toContain('testID="health-event-detail.context-empty.card"');
    expect(healthEventDetailSource).toContain('testID="health-event-detail.error.card"');
    expect(healthEventDetailSource).toContain('testID="health-event-detail.reload.button"');
    expect(healthEventDetailSource).toContain('testID="health-event-detail.load-error"');
  });

  it('guards async health event loading against stale focus effects and array route params', () => {
    expect(healthEventDetailSource).toContain('const eventId = Array.isArray(id) ? id[0] : id;');
    expect(healthEventDetailSource).toContain('void load(() => mounted);');
    expect(healthEventDetailSource).toContain('mounted = false;');
    expect(healthEventDetailSource).toContain('if (shouldApply()) setLoading(false);');
    expect(healthEventDetailSource).toContain(
      'setEvent((current) => (current?.id === eventId ? current : null));',
    );
    expect(
      (healthEventDetailSource.match(/if \(!shouldApply\(\)\) return;/g) ?? []).length,
    ).toBeGreaterThanOrEqual(3);
  });

  it('locks health event editing, linked records, and recovery actions together', () => {
    expect(healthEventDetailSource).toContain(
      'const interactionLocked = busy || loading || contextUnavailable;',
    );
    expect(healthEventDetailSource).toContain(
      'const canSave = canEdit && !interactionLocked && isDirty && Boolean(title.trim());',
    );
    expect(healthEventDetailSource).toContain(
      "const canRecover = canEdit && !interactionLocked && event?.status === 'ACTIVE';",
    );
    expect(healthEventDetailSource).toContain('if (!event || interactionLocked) return;');
    expect(healthEventDetailSource).toContain('editable={canEdit && !interactionLocked}');
    expect(
      (healthEventDetailSource.match(/disabled={interactionLocked}/g) ?? []).length,
    ).toBeGreaterThanOrEqual(5);
    expect(healthEventDetailSource).toContain('interactionLocked && styles.disabled');
  });

  it('keeps recovered health event copy single and unambiguous', () => {
    expect((healthEventDetailSource.match(/恢复于/g) ?? []).length).toBe(1);
  });
});
