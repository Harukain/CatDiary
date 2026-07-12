import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';

const COOLING_MS = 7 * 24 * 60 * 60 * 1000;

export async function processAccountDeletions(prisma: PrismaClient, now = new Date()) {
  const users = await prisma.user.findMany({
    where: {
      status: 'PENDING_DELETION',
      deletionRequestedAt: { lte: new Date(now.getTime() - COOLING_MS) },
    },
    select: { id: true },
  });
  let familiesScheduled = 0;
  for (const user of users) {
    await prisma.$transaction(async (tx) => {
      const memberships = await tx.membership.findMany({
        where: { userId: user.id, status: 'ACTIVE' },
        select: { familyId: true },
      });
      await tx.accountAuditLog.create({
        data: {
          actorUserId: user.id,
          action: 'account.deletion.finalize',
          safeData: { membershipsLeft: memberships.length },
        },
      });
      await tx.membership.updateMany({
        where: { userId: user.id, status: 'ACTIVE' },
        data: { status: 'LEFT' },
      });
      await tx.deviceSession.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: now, revokeReason: 'account_deleted' },
      });
      await tx.devicePushToken.updateMany({
        where: { userId: user.id, active: true },
        data: { active: false },
      });
      await tx.user.update({
        where: { id: user.id },
        data: {
          phoneHash: `deleted:${randomUUID()}`,
          phoneEncrypted: '',
          displayName: null,
          status: 'DELETED',
          deletionRequestedAt: null,
          deletedAt: now,
        },
      });
      for (const membership of memberships) {
        const activeMembers = await tx.membership.count({
          where: { familyId: membership.familyId, status: 'ACTIVE' },
        });
        if (!activeMembers) {
          await tx.family.updateMany({
            where: { id: membership.familyId, deletedAt: null },
            data: { deletedAt: now },
          });
          familiesScheduled += 1;
        }
      }
    });
  }
  return { accountsFinalized: users.length, familiesScheduled };
}
