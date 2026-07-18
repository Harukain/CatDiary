import { describe, expect, it } from 'vitest';
import familyRouteSource from '../../../app/onboarding/family.tsx?raw';
import petRouteSource from '../../../app/onboarding/pet.tsx?raw';

describe('onboarding state guards', () => {
  it('keeps family creation from redirecting before session restoration finishes', () => {
    expect(familyRouteSource).toContain('const { restoring, session, addFamily } = useSession();');
    expect(familyRouteSource).toContain('testID="onboarding.family.restoring.card"');
    expect(familyRouteSource.indexOf('if (restoring)')).toBeLessThan(
      familyRouteSource.indexOf('if (!session)'),
    );
    expect(familyRouteSource).toContain('const canSubmit = !!session');
    expect(familyRouteSource).toContain('if (!session || !canSubmit) return;');
    expect(familyRouteSource).toContain('editable={!busy}');
    expect(familyRouteSource).toContain('disabled={!canSubmit}');
    expect(familyRouteSource).not.toContain('session!');
  });

  it('keeps first pet creation from redirecting before family restoration finishes', () => {
    expect(petRouteSource).toContain('const { restoring, session, activeFamily } = useSession();');
    expect(petRouteSource).toContain('testID="onboarding.pet.restoring.card"');
    expect(petRouteSource.indexOf('if (restoring)')).toBeLessThan(
      petRouteSource.indexOf('if (!session)'),
    );
    expect(petRouteSource.indexOf('if (restoring)')).toBeLessThan(
      petRouteSource.indexOf('if (!activeFamily)'),
    );
    expect(petRouteSource).toContain('const canSubmit =');
    expect(petRouteSource).toContain('!!activeFamily');
    expect(petRouteSource).toContain('disabled={!canSubmit}');
  });

  it('guards pet-count loading against stale async writes and missing context', () => {
    expect(petRouteSource).toContain('const mountedRef = useRef(true);');
    expect(petRouteSource).toContain('mountedRef.current = false;');
    expect(petRouteSource).toContain('void loadPetCount(() => mounted);');
    expect(petRouteSource).toContain('mounted = false;');
    expect(petRouteSource).toContain('await loadPetCount(() => mountedRef.current);');
    expect(petRouteSource).toContain('setPetCount(null);');
    expect(petRouteSource).toContain('setCountLoading(false);');
    expect(
      (petRouteSource.match(/if \(!shouldApply\(\)\) return;/g) ?? []).length,
    ).toBeGreaterThanOrEqual(3);
    expect(petRouteSource).toContain('testID="onboarding.pet.count.retry.button"');
  });

  it('surfaces invalid pet creation context instead of silently ignoring submit', () => {
    expect(petRouteSource).toContain('if (!session || !activeFamily) {');
    expect(petRouteSource).toContain("setError('登录或家庭状态已失效，请重新进入后再试');");
    expect(petRouteSource).not.toContain('session!');
    expect(petRouteSource).not.toContain('activeFamily!');
  });
});
