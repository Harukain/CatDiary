export type QuickAddActionPath =
  | '/records/new'
  | '/records/new?type=FOOD'
  | '/records/new?type=WEIGHT'
  | '/records/new?type=LITTER'
  | '/photos/new'
  | '/plans/new'
  | '/onboarding/pet?returnTo=pets';

export type QuickAddAction = {
  icon:
    | 'restaurant-outline'
    | 'scale-outline'
    | 'sparkles-outline'
    | 'camera-outline'
    | 'create-outline'
    | 'notifications-outline'
    | 'paw-outline';
  title: string;
  detail: string;
  path: QuickAddActionPath;
  group: 'record' | 'manage';
  placement: 'card' | 'row';
  requiresManagement?: boolean;
};

export const quickAddActions: QuickAddAction[] = [
  {
    icon: 'restaurant-outline',
    title: '饮食',
    detail: '吃了什么',
    path: '/records/new?type=FOOD',
    group: 'record',
    placement: 'card',
  },
  {
    icon: 'scale-outline',
    title: '体重',
    detail: 'kg 和时间',
    path: '/records/new?type=WEIGHT',
    group: 'record',
    placement: 'card',
  },
  {
    icon: 'sparkles-outline',
    title: '铲屎',
    detail: '可选公共猫砂盆',
    path: '/records/new?type=LITTER',
    group: 'record',
    placement: 'card',
  },
  {
    icon: 'camera-outline',
    title: '照片',
    detail: '多图、备注和猫咪',
    path: '/photos/new',
    group: 'record',
    placement: 'card',
  },
  {
    icon: 'create-outline',
    title: '更多记录类型',
    detail: '饮水、排便、呕吐、用药、疫苗、驱虫',
    path: '/records/new',
    group: 'record',
    placement: 'row',
  },
  {
    icon: 'notifications-outline',
    title: '新建照顾计划',
    detail: '疫苗、驱虫、用药或铲屎提醒',
    path: '/plans/new',
    group: 'manage',
    placement: 'row',
    requiresManagement: true,
  },
  {
    icon: 'paw-outline',
    title: '添加猫咪档案',
    detail: '创建新猫咪，家庭最多 5 只',
    path: '/onboarding/pet?returnTo=pets',
    group: 'manage',
    placement: 'row',
    requiresManagement: true,
  },
];

export function visibleQuickAddActions(canManage: boolean) {
  return canManage
    ? quickAddActions
    : quickAddActions.filter((action) => !action.requiresManagement);
}

export function visibleQuickAddActionsByPlacement(canManage: boolean, placement: 'card' | 'row') {
  return visibleQuickAddActions(canManage).filter((action) => action.placement === placement);
}

export function hasHiddenManagementQuickAddActions(canManage: boolean) {
  return !canManage && quickAddActions.some((action) => action.requiresManagement);
}

export function isQuickAddRoute(path: string) {
  return quickAddActions.some((action) => action.path === path);
}
