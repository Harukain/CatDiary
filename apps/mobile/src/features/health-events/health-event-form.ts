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
