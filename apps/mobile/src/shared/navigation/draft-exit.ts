export type DraftExitDecision = 'continue' | 'confirmDiscard' | 'wait';

export function resolveDraftExitDecision({
  busy,
  isDirty,
  allowLeave,
}: {
  busy: boolean;
  isDirty: boolean;
  allowLeave?: boolean;
}): DraftExitDecision {
  if (busy) return 'wait';
  if (allowLeave || !isDirty) return 'continue';
  return 'confirmDiscard';
}
