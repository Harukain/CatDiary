import type { PrismaClient } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { processAccountDeletions } from './account-cleanup.js';

describe('processAccountDeletions', () => {
  it('anonymizes due accounts, leaves memberships and schedules empty families for deletion', async () => {
    const calls = { userStatus: '', membershipStatus: '', familyDeleted: false, audit: '' };
    const tx = {
      membership: {
        findMany: async () => [{ familyId: 'family-1' }],
        updateMany: async ({ data }: { data: { status: string } }) => {
          calls.membershipStatus = data.status;
        },
        count: async () => 0,
      },
      accountAuditLog: {
        create: async ({ data }: { data: { action: string } }) => {
          calls.audit = data.action;
        },
      },
      deviceSession: { updateMany: async () => ({ count: 1 }) },
      devicePushToken: { updateMany: async () => ({ count: 1 }) },
      user: {
        update: async ({ data }: { data: { status: string; phoneEncrypted: string } }) => {
          calls.userStatus = `${data.status}:${data.phoneEncrypted}`;
        },
      },
      family: {
        updateMany: async () => {
          calls.familyDeleted = true;
          return { count: 1 };
        },
      },
    };
    const prisma = {
      user: { findMany: async () => [{ id: 'user-1' }] },
      $transaction: async (callback: (client: typeof tx) => Promise<void>) => callback(tx),
    } as unknown as PrismaClient;
    const result = await processAccountDeletions(prisma, new Date('2026-07-20T00:00:00Z'));
    expect(result).toEqual({ accountsFinalized: 1, familiesScheduled: 1 });
    expect(calls).toEqual({
      userStatus: 'DELETED:',
      membershipStatus: 'LEFT',
      familyDeleted: true,
      audit: 'account.deletion.finalize',
    });
  });
});
