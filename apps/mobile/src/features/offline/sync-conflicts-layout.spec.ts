import { describe, expect, it } from 'vitest';
import syncConflictsSource from '../../../app/sync-conflicts.tsx?raw';

describe('sync conflicts mobile layout', () => {
  it('keeps conflict page actions fixed and safe-area aware', () => {
    expect(syncConflictsSource).toContain('useSafeAreaInsets');
    expect(syncConflictsSource).toContain('keyboardShouldPersistTaps="handled"');
    expect(syncConflictsSource).toContain('testID="sync-conflicts.footer"');
    expect(syncConflictsSource).toContain('testID="sync-conflicts.reload.button"');
    expect(syncConflictsSource).toContain('testID="sync-conflicts.return.button"');
    expect(syncConflictsSource).toContain(
      'paddingBottom: Math.max(spacing.md, insets.bottom + spacing.sm)',
    );
  });

  it('keeps conflict comparison readable on narrow phones', () => {
    expect(syncConflictsSource).toContain('testID="sync-conflicts.compare"');
    expect(syncConflictsSource).toContain('comparisonSection');
    expect(syncConflictsSource).toContain('本机操作');
    expect(syncConflictsSource).toContain('服务端最新状态');
    expect(syncConflictsSource).not.toContain("compare: { flexDirection: 'row'");
    expect(syncConflictsSource).not.toContain('styles.divider');
  });

  it('does not get stuck loading when session context is missing', () => {
    expect(syncConflictsSource).toContain('if (!session || !activeFamily) {');
    expect(syncConflictsSource).toContain('setItems([]);');
    expect(syncConflictsSource).toContain('setLoading(false);');
    expect(syncConflictsSource).not.toContain('if (!session || !activeFamily) return;');
  });
});
