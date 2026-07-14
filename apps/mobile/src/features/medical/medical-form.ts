import type { MedicalRecordType } from '../auth/auth-api';

export type MedicalRecordDraft = {
  petId: string;
  type: MedicalRecordType;
  title: string;
  occurredDate: string;
  nextDate: string;
  brand: string;
  batch: string;
  dose: string;
  provider: string;
  reaction: string;
  note: string;
};

export function isMedicalRecordDraftDirty(
  draft: MedicalRecordDraft,
  initial: Pick<MedicalRecordDraft, 'petId' | 'type' | 'occurredDate'>,
) {
  return (
    draft.petId !== initial.petId ||
    draft.type !== initial.type ||
    draft.occurredDate !== initial.occurredDate ||
    draft.title.trim() !== '' ||
    draft.nextDate.trim() !== '' ||
    draft.brand.trim() !== '' ||
    draft.batch.trim() !== '' ||
    draft.dose.trim() !== '' ||
    draft.provider.trim() !== '' ||
    draft.reaction.trim() !== '' ||
    draft.note.trim() !== ''
  );
}
