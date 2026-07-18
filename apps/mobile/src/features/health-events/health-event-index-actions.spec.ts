import { describe, expect, it } from 'vitest';
import healthEventsIndexSource from '../../../app/health-events/index.tsx?raw';

describe('health event index actions', () => {
  it('keeps health event list actions fixed and safe-area aware', () => {
    expect(healthEventsIndexSource).toContain('useSafeAreaInsets');
    expect(healthEventsIndexSource).toContain('keyboardShouldPersistTaps="handled"');
    expect(healthEventsIndexSource).toContain('testID="health-events.footer"');
    expect(healthEventsIndexSource).toContain('testID="health-events.record-symptom.button"');
    expect(healthEventsIndexSource).toContain('testID="health-events.retry.button"');
    expect(healthEventsIndexSource).toContain('testID="health-events.timeline.button"');
    expect(healthEventsIndexSource).toContain('testID="health-events.return.button"');
    expect(healthEventsIndexSource).toContain(
      'paddingBottom: Math.max(spacing.md, insets.bottom + spacing.sm)',
    );
  });

  it('keeps health events created from explicit record ownership instead of the list itself', () => {
    expect(healthEventsIndexSource).toContain(
      'const canRecordSymptom = !interactionLocked && !!session && !!activeFamily;',
    );
    expect(healthEventsIndexSource).toContain('function openRecordSymptom()');
    expect(healthEventsIndexSource).toContain("params: { type: 'VOMIT' }");
    expect(healthEventsIndexSource).toContain('function openTimeline()');
    expect(healthEventsIndexSource).toContain('先记录呕吐、排便或用药等异常');
    expect(healthEventsIndexSource).not.toContain("pathname: '/health-events/new'");
  });

  it('shows explicit restoration, missing context, and load failure states', () => {
    expect(healthEventsIndexSource).toContain(
      'const { restoring, session, activeFamily } = useSession();',
    );
    expect(healthEventsIndexSource).toContain(
      'const contextUnavailable = !restoring && (!session || !activeFamily);',
    );
    expect(healthEventsIndexSource).toContain('const loadingInitial = restoring || loading;');
    expect(healthEventsIndexSource).toContain('testID="health-events.loading.card"');
    expect(healthEventsIndexSource).toContain('testID="health-events.context-empty.card"');
    expect(healthEventsIndexSource).toContain('testID="health-events.error.card"');
    expect(healthEventsIndexSource).toContain('testID="health-events.reload.inline-button"');
    expect(healthEventsIndexSource).toContain('testID="health-events.error.text"');
  });

  it('guards health event list refresh against stale focus effects', () => {
    expect(healthEventsIndexSource).toContain('const mountedRef = useRef(true);');
    expect(healthEventsIndexSource).toContain('mountedRef.current = false;');
    expect(healthEventsIndexSource).toContain('void load(() => mounted);');
    expect(healthEventsIndexSource).toContain('mounted = false;');
    expect(healthEventsIndexSource).toContain('await load(() => mountedRef.current);');
    expect(
      (healthEventsIndexSource.match(/if \(!shouldApply\(\)\) return;/g) ?? []).length,
    ).toBeGreaterThanOrEqual(3);
  });

  it('locks filters, detail entries, record symptom, and timeline actions while unavailable', () => {
    expect(healthEventsIndexSource).toContain(
      'const interactionLocked = loading || contextUnavailable;',
    );
    expect(healthEventsIndexSource).toContain('const canOpenTimeline = !interactionLocked;');
    expect(healthEventsIndexSource).toContain('if (interactionLocked) return;');
    expect(healthEventsIndexSource).toContain('if (!canRecordSymptom) return;');
    expect(healthEventsIndexSource).toContain('if (!canOpenTimeline) return;');
    expect(healthEventsIndexSource).toContain(
      'accessibilityState={{ disabled: interactionLocked }}',
    );
    expect(
      (healthEventsIndexSource.match(/disabled={interactionLocked}/g) ?? []).length,
    ).toBeGreaterThanOrEqual(3);
    expect(healthEventsIndexSource).toContain('pressed && !interactionLocked && styles.pressed');
  });
});
