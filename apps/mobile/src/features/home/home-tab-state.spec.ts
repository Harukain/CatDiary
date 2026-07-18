import { describe, expect, it } from 'vitest';
import homeTabSource from '../../../app/(tabs)/index.tsx?raw';

describe('home tab state handling', () => {
  it('exits loading when session or family context is unavailable', () => {
    expect(homeTabSource).toContain('const { restoring, session, activeFamily } = useSession();');
    expect(homeTabSource).toContain(
      'const contextUnavailable = !restoring && (!session || !activeFamily);',
    );
    expect(homeTabSource).toContain('if (restoring) return;');
    expect(homeTabSource).toContain('setPets([]);');
    expect(homeTabSource).toContain('setTodayTasks([]);');
    expect(homeTabSource).toContain('setEnabledPlanCount(0);');
    expect(homeTabSource).toContain('setLoading(false);');
    expect(homeTabSource).toContain('testID="home.context-empty.card"');
  });

  it('renders explicit loading and reloadable error states', () => {
    expect(homeTabSource).toContain('testID="home.loading.card"');
    expect(homeTabSource).toContain('正在加载首页数据…');
    expect(homeTabSource).toContain('testID="home.error.card"');
    expect(homeTabSource).toContain('testID="home.error.text"');
    expect(homeTabSource).toContain('testID="home.reload.button"');
    expect(homeTabSource).not.toContain("setError('猫咪档案加载失败')");
  });

  it('locks top-level navigation and quick actions while unavailable', () => {
    expect(homeTabSource).toContain('const interactionLocked = loading || contextUnavailable;');
    expect(
      homeTabSource.match(/disabled=\{interactionLocked\}/g)?.length ?? 0,
    ).toBeGreaterThanOrEqual(6);
    expect(homeTabSource).toContain('accessibilityState={{ disabled: interactionLocked }}');
    expect(homeTabSource).toContain('accessibilityState={{ disabled: !!disabled }}');
    expect(homeTabSource).toContain('disabled && styles.disabled');
  });

  it('guards focus reloads against writing state after leaving the tab', () => {
    expect(homeTabSource).toContain('void load(() => active);');
    expect(homeTabSource).toContain('active = false;');
    expect(
      homeTabSource.match(/if \(!shouldApply\(\)\) return;/g)?.length ?? 0,
    ).toBeGreaterThanOrEqual(3);
    expect(homeTabSource).toContain('if (shouldApply()) setLoading(false);');
  });

  it('prompts new families to create the first enabled care plan', () => {
    expect(homeTabSource).toContain('const [enabledPlanCount, setEnabledPlanCount] = useState(0);');
    expect(homeTabSource).toContain(
      'const showFirstPlanPrompt =\n    !loading && !contextUnavailable && !error && pets.length > 0 && enabledPlanCount === 0;',
    );
    expect(homeTabSource).toContain(
      'authApi.listPlans(session.accessToken, activeFamily.id, true)',
    );
    expect(homeTabSource).toContain('setEnabledPlanCount(nextPlans.length);');
    expect(homeTabSource).toContain('testID="home.first-plan-prompt"');
    expect(homeTabSource).toContain('testID="home.first-plan-prompt.create"');
    expect(homeTabSource).toContain("router.push('/plans/new')");
  });
});
