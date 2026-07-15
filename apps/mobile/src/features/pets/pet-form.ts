import { isCalendarDateOnOrBefore } from '@cat-diary/domain';

export function isValidBirthDate(value: string, now = new Date(), timeZone = 'Asia/Shanghai') {
  return isCalendarDateOnOrBefore(value, now, timeZone);
}

export type PetProfileDraft = {
  name: string;
  sex: string;
  birthDate: string;
  breed: string;
  chipNumber: string;
  neutered: boolean | null;
};

export function petProfileDraftSnapshot(draft: PetProfileDraft) {
  return JSON.stringify({
    name: draft.name.trim(),
    sex: draft.sex,
    birthDate: draft.birthDate,
    breed: draft.breed.trim(),
    chipNumber: draft.chipNumber.trim(),
    neutered: draft.neutered,
  });
}

export function isPetProfileDraftDirty(draft: PetProfileDraft, initial: PetProfileDraft) {
  return petProfileDraftSnapshot(draft) !== petProfileDraftSnapshot(initial);
}
