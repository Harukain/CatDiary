import { describe, expect, it } from 'vitest';
import recordDetailSource from '../../../app/records/[id].tsx?raw';

describe('record detail editable footer', () => {
  it('keeps manual record editing actions fixed and safe-area aware', () => {
    expect(recordDetailSource).toContain('KeyboardAvoidingView');
    expect(recordDetailSource).toContain('Keyboard.addListener');
    expect(recordDetailSource).toContain('useSafeAreaInsets');
    expect(recordDetailSource).toContain('testID="record-detail.footer"');
    expect(recordDetailSource).toContain('testID="record-detail.save.button"');
    expect(recordDetailSource).toContain('testID="record-detail.delete.button"');
    expect(recordDetailSource).toContain('testID="record-detail.back-timeline.button"');
    expect(recordDetailSource).toContain(
      'paddingBottom: Math.max(spacing.md, insets.bottom + spacing.sm)',
    );
    expect(recordDetailSource).toContain('!keyboardVisible ? (');
  });

  it('keeps an inline save action available while the keyboard is visible', () => {
    expect(recordDetailSource).toContain('keyboardVisible ? (');
    expect(recordDetailSource).toContain('testID="record-detail.save.inline-button"');
  });

  it('shows explicit restoration, missing context, and load failure states', () => {
    expect(recordDetailSource).toContain(
      'const { restoring, session, activeFamily } = useSession();',
    );
    expect(recordDetailSource).toContain(
      'const contextUnavailable = !restoring && (!session || !activeFamily || !id);',
    );
    expect(recordDetailSource).toContain(
      'const loadingInitial = restoring || (loading && !record);',
    );
    expect(recordDetailSource).toContain('testID="record-detail.loading.card"');
    expect(recordDetailSource).toContain('testID="record-detail.context-empty.card"');
    expect(recordDetailSource).toContain('testID="record-detail.error.card"');
    expect(recordDetailSource).toContain('testID="record-detail.reload.button"');
    expect(recordDetailSource).toContain('testID="record-detail.load-error"');
  });

  it('guards record detail loading against stale effects and array route params', () => {
    expect(recordDetailSource).toContain(
      'const params = useLocalSearchParams<{ id?: string | string[] }>();',
    );
    expect(recordDetailSource).toContain(
      "const id = Array.isArray(params.id) ? params.id[0] : (params.id ?? '');",
    );
    expect(recordDetailSource).toContain('void load(() => mounted);');
    expect(recordDetailSource).toContain('mounted = false;');
    expect(recordDetailSource).toContain('const mountedRef = useRef(true);');
    expect(recordDetailSource).toContain('mountedRef.current = false;');
    expect(
      (recordDetailSource.match(/if \(!shouldApply\(\)\) return;/g) ?? []).length,
    ).toBeGreaterThanOrEqual(3);
    expect(
      (recordDetailSource.match(/if \(!mountedRef\.current\) return;/g) ?? []).length,
    ).toBeGreaterThanOrEqual(3);
  });

  it('locks editing, photo, health event, delete, and return actions while busy or loading', () => {
    expect(recordDetailSource).toContain(
      'const interactionLocked = busy || loading || contextUnavailable;',
    );
    expect(recordDetailSource).toContain('if (busy || loading)');
    expect(recordDetailSource).toContain('if (!busy && !loading && !detailDirty) return false;');
    expect(recordDetailSource).toContain(
      'if (!record || !session || !activeFamily || interactionLocked) return;',
    );
    expect(recordDetailSource).toContain('editable={!interactionLocked}');
    expect(recordDetailSource).toContain('disabled={interactionLocked}');
    expect(recordDetailSource).toContain('accessibilityState={{ disabled: interactionLocked }}');
    expect(recordDetailSource).toContain('pressed && !interactionLocked && styles.pressed');
  });
});
