import { describe, expect, it } from 'vitest';
import {
  hasHiddenManagementQuickAddActions,
  isQuickAddRoute,
  quickAddActions,
  visibleQuickAddActions,
  visibleQuickAddActionsByPlacement,
} from './quick-add-actions';

describe('quick add action rules', () => {
  it('keeps the central plus as a quick action sheet instead of a tab destination', () => {
    expect(quickAddActions.map((action) => action.path)).toEqual([
      '/records/new?type=FOOD',
      '/records/new?type=WEIGHT',
      '/records/new?type=LITTER',
      '/photos/new',
      '/records/new',
      '/plans/new',
      '/onboarding/pet?returnTo=pets',
    ]);
    expect(isQuickAddRoute('/(tabs)/add')).toBe(false);
  });

  it('puts high-frequency record actions into tappable sheet cards', () => {
    expect(visibleQuickAddActionsByPlacement(true, 'card').map((action) => action.path)).toEqual([
      '/records/new?type=FOOD',
      '/records/new?type=WEIGHT',
      '/records/new?type=LITTER',
      '/photos/new',
    ]);
  });

  it('shows all quick actions to family managers', () => {
    expect(visibleQuickAddActions(true).map((action) => action.title)).toEqual([
      '饮食',
      '体重',
      '铲屎',
      '照片',
      '更多记录类型',
      '新建照顾计划',
      '添加猫咪档案',
    ]);
  });

  it('hides manager-only actions from regular family members', () => {
    expect(visibleQuickAddActions(false).map((action) => action.path)).toEqual([
      '/records/new?type=FOOD',
      '/records/new?type=WEIGHT',
      '/records/new?type=LITTER',
      '/photos/new',
      '/records/new',
    ]);
    expect(hasHiddenManagementQuickAddActions(false)).toBe(true);
    expect(hasHiddenManagementQuickAddActions(true)).toBe(false);
  });

  it('keeps write actions aligned with MVP ownership rules', () => {
    const memberActions = visibleQuickAddActions(false);
    expect(memberActions.every((action) => !action.requiresManagement)).toBe(true);
    expect(memberActions.some((action) => action.path === '/records/new')).toBe(true);
    expect(memberActions.some((action) => action.path === '/photos/new')).toBe(true);
  });
});
