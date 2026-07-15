export type AccountDeletionDraft = {
  code: string;
  maskedPhone: string;
};

export function sanitizeDeletionCode(value: string) {
  return value.replace(/\D/g, '').slice(0, 6);
}

export function isAccountDeletionDraftDirty(draft: AccountDeletionDraft) {
  return draft.code.trim() !== '' || draft.maskedPhone.trim() !== '';
}
