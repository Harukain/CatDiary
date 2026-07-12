import { SetMetadata } from '@nestjs/common';

export const ALLOW_PENDING_DELETION = 'allowPendingDeletion';
export const AllowPendingDeletion = () => SetMetadata(ALLOW_PENDING_DELETION, true);
