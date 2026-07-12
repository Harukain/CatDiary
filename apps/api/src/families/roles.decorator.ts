import { SetMetadata } from '@nestjs/common';
import type { FamilyRole } from '@prisma/client';

export const FAMILY_ROLES_KEY = 'familyRoles';
export const FamilyRoles = (...roles: FamilyRole[]) => SetMetadata(FAMILY_ROLES_KEY, roles);
