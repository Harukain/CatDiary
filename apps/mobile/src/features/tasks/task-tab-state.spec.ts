import { describe, expect, it } from 'vitest';
import tasksTabSource from '../../../app/(tabs)/tasks.tsx?raw';

describe('tasks tab state handling', () => {
  it('exits loading when session or family context is unavailable', () => {
    expect(tasksTabSource).toContain('const { restoring, session, activeFamily } = useSession();');
    expect(tasksTabSource).toContain(
      'const contextUnavailable = !restoring && (!session || !activeFamily);',
    );
    expect(tasksTabSource).toContain('if (restoring) return;');
    expect(tasksTabSource).toContain('setTasks([]);');
    expect(tasksTabSource).toContain('setEnabledPlanCount(null);');
    expect(tasksTabSource).toContain('setLoading(false);');
    expect(tasksTabSource).toContain('testID="tasks.context-empty.card"');
  });

  it('renders explicit loading and reloadable error states instead of a bare spinner', () => {
    expect(tasksTabSource).toContain('testID="tasks.loading.card"');
    expect(tasksTabSource).toContain('正在加载照顾任务…');
    expect(tasksTabSource).toContain('testID="tasks.error.card"');
    expect(tasksTabSource).toContain('testID="tasks.reload.button"');
    expect(tasksTabSource).not.toContain('{error ? <ErrorText>{error}</ErrorText> : null}');
  });

  it('locks filters and task actions while loading, completing, or mutating', () => {
    expect(tasksTabSource).toContain(
      'const interactionLocked = loading || Boolean(actionId) || Boolean(completingTask);',
    );
    expect(tasksTabSource).toContain(
      'const canOpenPlanActions = canManagePlans && !interactionLocked && !contextUnavailable;',
    );
    expect(tasksTabSource).toContain('disabled={interactionLocked}');
    expect(tasksTabSource).toContain(
      'accessibilityState={{ selected: scope === item.value, disabled: interactionLocked }}',
    );
    expect(
      tasksTabSource.match(/disabled=\{Boolean\(actionId\)\}/g)?.length ?? 0,
    ).toBeGreaterThanOrEqual(4);
    expect(
      tasksTabSource.match(/disabled=\{!canOpenPlanActions\}/g)?.length ?? 0,
    ).toBeGreaterThanOrEqual(3);
  });

  it('distinguishes empty task lists from families without enabled care plans', () => {
    expect(tasksTabSource).toContain(
      'const [enabledPlanCount, setEnabledPlanCount] = useState<number | null>(null);',
    );
    expect(tasksTabSource).toContain('.listPlans(session.accessToken, activeFamily.id, true)');
    expect(tasksTabSource).toContain('.then((plans) => plans.length)');
    expect(tasksTabSource).toContain('.catch(() => null)');
    expect(tasksTabSource).toContain('setEnabledPlanCount(nextEnabledPlanCount);');
    expect(tasksTabSource).toContain('testID="tasks.empty.card"');
    expect(tasksTabSource).toContain("if (scope !== 'completed' && enabledPlanCount === 0)");
    expect(tasksTabSource).toContain('还没有照顾计划');
    expect(tasksTabSource).toContain('创建第一个照顾计划');
    expect(tasksTabSource).toContain('请让家庭管理员先创建疫苗、驱虫、用药或铲屎提醒');
  });
});
