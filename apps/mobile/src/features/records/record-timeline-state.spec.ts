import { describe, expect, it } from 'vitest';
import recordsTabSource from '../../../app/(tabs)/records.tsx?raw';

describe('record timeline state handling', () => {
  it('exits loading when session or family context is unavailable', () => {
    expect(recordsTabSource).toContain(
      'const { restoring, session, activeFamily } = useSession();',
    );
    expect(recordsTabSource).toContain(
      'const contextUnavailable = !restoring && (!session || !activeFamily);',
    );
    expect(recordsTabSource).toContain('if (restoring) return;');
    expect(recordsTabSource).toContain('setRecords([]);');
    expect(recordsTabSource).toContain('setPets([]);');
    expect(recordsTabSource).toContain('setLoading(false);');
    expect(recordsTabSource).toContain('testID="records.context-empty.card"');
  });

  it('renders explicit loading and reloadable error states', () => {
    expect(recordsTabSource).toContain('testID="records.loading.card"');
    expect(recordsTabSource).toContain('正在整理记录时间线…');
    expect(recordsTabSource).toContain('testID="records.error.card"');
    expect(recordsTabSource).toContain('testID="records.error.text"');
    expect(recordsTabSource).toContain('testID="records.reload.button"');
    expect(recordsTabSource).not.toContain('{loading ? (\\n          <ActivityIndicator');
  });

  it('locks filters, sync conflict entry, and related timeline links while unavailable', () => {
    expect(recordsTabSource).toContain('const interactionLocked = loading || contextUnavailable;');
    expect(
      recordsTabSource.match(/disabled=\{interactionLocked\}/g)?.length ?? 0,
    ).toBeGreaterThanOrEqual(4);
    expect(recordsTabSource).toContain(
      "disabled={!syncNote.includes('冲突') || interactionLocked}",
    );
    expect(recordsTabSource).toContain(
      "accessibilityState={{ disabled: !syncNote.includes('冲突') || interactionLocked }}",
    );
  });

  it('guards focus reloads against writing state after leaving the tab', () => {
    expect(recordsTabSource).toContain('void load(() => active);');
    expect(recordsTabSource).toContain('active = false;');
    expect(
      recordsTabSource.match(/if \(!shouldApply\(\)\) return;/g)?.length ?? 0,
    ).toBeGreaterThanOrEqual(4);
    expect(recordsTabSource).toContain('if (shouldApply()) setLoading(false);');
  });
});
