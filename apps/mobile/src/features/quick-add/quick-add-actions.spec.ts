import { describe, expect, it } from 'vitest';
import { isQuickAddRoute, quickAddActions, visibleQuickAddActions } from './quick-add-actions';

describe('quick add action rules', () => {
  it('keeps the central plus as a quick action sheet instead of a tab destination', () => {
    expect(quickAddActions.map((action) => action.path)).toEqual([
      '/records/new',
      '/plans/new',
      '/photos/new',
      '/onboarding/pet',
    ]);
    expect(isQuickAddRoute('/(tabs)/add')).toBe(false);
  });

  it('shows all quick actions to family managers', () => {
    expect(visibleQuickAddActions(true).map((action) => action.title)).toEqual([
      '新增生活或健康记录',
      '新建照顾计划',
      '上传猫咪照片',
      '添加猫咪档案',
    ]);
  });

  it('hides manager-only actions from regular family members', () => {
    expect(visibleQuickAddActions(false).map((action) => action.path)).toEqual([
      '/records/new',
      '/photos/new',
    ]);
  });

  it('keeps write actions aligned with MVP ownership rules', () => {
    const memberActions = visibleQuickAddActions(false);
    expect(memberActions.every((action) => !action.requiresManagement)).toBe(true);
    expect(memberActions.some((action) => action.path === '/records/new')).toBe(true);
    expect(memberActions.some((action) => action.path === '/photos/new')).toBe(true);
  });
});
