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

export type MedicalRecordDetailDraft = {
  title: string;
  occurredDate: string;
  nextDate: string;
  brand: string;
  batchNumber: string;
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

export function isMedicalRecordDetailDraftDirty(
  draft: MedicalRecordDetailDraft,
  initial: MedicalRecordDetailDraft,
) {
  return (
    draft.title.trim() !== initial.title.trim() ||
    draft.occurredDate.trim() !== initial.occurredDate.trim() ||
    draft.nextDate.trim() !== initial.nextDate.trim() ||
    draft.brand.trim() !== initial.brand.trim() ||
    draft.batchNumber.trim() !== initial.batchNumber.trim() ||
    draft.dose.trim() !== initial.dose.trim() ||
    draft.provider.trim() !== initial.provider.trim() ||
    draft.reaction.trim() !== initial.reaction.trim() ||
    draft.note.trim() !== initial.note.trim()
  );
}
