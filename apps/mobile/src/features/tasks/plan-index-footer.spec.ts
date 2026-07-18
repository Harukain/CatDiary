import { describe, expect, it } from 'vitest';
import plansIndexSource from '../../../app/plans/index.tsx?raw';

describe('plan index bottom actions and context states', () => {
  it('keeps plan list actions fixed and safe-area aware', () => {
    expect(plansIndexSource).toContain('useSafeAreaInsets');
    expect(plansIndexSource).toContain('keyboardShouldPersistTaps="handled"');
    expect(plansIndexSource).toContain('testID="plans.footer"');
    expect(plansIndexSource).toContain('testID="plans.create.button"');
    expect(plansIndexSource).toContain('testID="plans.reload.button"');
    expect(plansIndexSource).toContain('testID="plans.return.button"');
    expect(plansIndexSource).toContain(
      'paddingBottom: Math.max(spacing.md, insets.bottom + spacing.sm)',
    );
  });

  it('exits loading cleanly when session or family context is unavailable', () => {
    expect(plansIndexSource).toContain(
      'const { restoring, session, activeFamily } = useSession();',
    );
    expect(plansIndexSource).toContain(
      'const contextUnavailable = !restoring && (!session || !activeFamily);',
    );
    expect(plansIndexSource).toContain('if (restoring) return;');
    expect(plansIndexSource).toContain('setPlans([]);');
    expect(plansIndexSource).toContain('setPets([]);');
    expect(plansIndexSource).toContain('setLoading(false);');
    expect(plansIndexSource).toContain('testID="plans.context-empty"');
  });

  it('locks plan filters and create/edit/toggle actions while data or mutations are in flight', () => {
    expect(plansIndexSource).toContain(
      'const interactionDisabled = actionBusy || loading || contextUnavailable;',
    );
    expect(plansIndexSource).toContain(
      'const canCreate = !!session && !!activeFamily && canManage && !loading && !actionBusy;',
    );
    expect(plansIndexSource).toContain('testID="plans.scope.enabled"');
    expect(plansIndexSource).toContain('testID="plans.scope.paused"');
    expect(plansIndexSource).toContain('disabled={!canManage || actionBusy}');
    expect(plansIndexSource).toContain('disabled={actionBusy}');
    expect(plansIndexSource).toContain('disabled={!canCreate}');
    expect(plansIndexSource).toContain("'仅管理员可新建计划'");
  });
});
