export type QuickAddActionPath = '/records/new' | '/plans/new' | '/photos/new' | '/onboarding/pet';

export type QuickAddAction = {
  icon: 'create-outline' | 'notifications-outline' | 'camera-outline' | 'paw-outline';
  title: string;
  detail: string;
  path: QuickAddActionPath;
  requiresManagement?: boolean;
};

export const quickAddActions: QuickAddAction[] = [
  {
    icon: 'create-outline',
    title: '新增生活或健康记录',
    detail: '饮食、体重、排便、呕吐等日常情况',
    path: '/records/new',
  },
  {
    icon: 'notifications-outline',
    title: '新建照顾计划',
    detail: '疫苗、驱虫、用药或铲屎提醒',
    path: '/plans/new',
    requiresManagement: true,
  },
  {
    icon: 'camera-outline',
    title: '上传猫咪照片',
    detail: '支持多图、备注和同时绑定多只猫咪',
    path: '/photos/new',
  },
  {
    icon: 'paw-outline',
    title: '添加猫咪档案',
    detail: '创建新猫咪，家庭最多 5 只',
    path: '/onboarding/pet',
    requiresManagement: true,
  },
];

export function visibleQuickAddActions(canManage: boolean) {
  return canManage
    ? quickAddActions
    : quickAddActions.filter((action) => !action.requiresManagement);
}

export function isQuickAddRoute(path: string) {
  return quickAddActions.some((action) => action.path === path);
}
