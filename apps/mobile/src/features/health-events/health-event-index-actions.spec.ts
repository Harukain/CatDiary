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
      'const canRecordSymptom = !loading && !!session && !!activeFamily;',
    );
    expect(healthEventsIndexSource).toContain(
      "router.push({ pathname: '/records/new', params: { type: 'VOMIT' } })",
    );
    expect(healthEventsIndexSource).toContain('router.push(recordTimelineRoute)');
    expect(healthEventsIndexSource).toContain('先记录呕吐、排便或用药等异常');
    expect(healthEventsIndexSource).not.toContain("pathname: '/health-events/new'");
  });
});
