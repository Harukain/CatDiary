export type HealthEventDraft = {
  title: string;
  summary: string;
};

export function healthEventDraftSnapshot(draft: HealthEventDraft) {
  return JSON.stringify({
    title: draft.title,
    summary: draft.summary,
  });
}

export function isHealthEventDraftDirty(draft: HealthEventDraft, initial: HealthEventDraft) {
  return healthEventDraftSnapshot(draft) !== healthEventDraftSnapshot(initial);
}

export type HealthEventDetailNavigationTarget = 'return' | 'linkRecord' | 'viewRecord';

export type HealthEventDetailNavigationDecision = 'continue' | 'confirmDiscard' | 'wait';

export function resolveHealthEventDetailNavigationDecision({
  busy,
  isDirty,
}: {
  busy: boolean;
  isDirty: boolean;
}): HealthEventDetailNavigationDecision {
  if (busy) return 'wait';
  if (isDirty) return 'confirmDiscard';
  return 'continue';
}

export function healthEventDetailNavigationCopy(target: HealthEventDetailNavigationTarget) {
  if (target === 'return') {
    return {
      title: '放弃未保存的健康事件修改？',
      message: '当前标题或情况摘要尚未保存，离开后会丢失修改。',
      confirmLabel: '放弃修改',
    };
  }
  if (target === 'linkRecord') {
    return {
      title: '先处理未保存修改？',
      message: '继续关联记录会离开当前页面，未保存的标题或摘要修改不会保留。',
      confirmLabel: '放弃并关联',
    };
  }
  return {
    title: '先处理未保存修改？',
    message: '打开关联记录会离开当前页面，未保存的标题或摘要修改不会保留。',
    confirmLabel: '放弃并查看',
  };
}
