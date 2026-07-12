import type { FamilyRole } from '@prisma/client';

export interface FamilyContext {
  familyId: string;
  membershipId: string;
  role: FamilyRole;
}
