import { describe, expect, it, vi } from 'vitest';
import { PetsService } from './pets.service';

function fixture(options: { petUpdateCount?: number } = {}) {
  const tx = {
    pet: { updateMany: vi.fn().mockResolvedValue({ count: options.petUpdateCount ?? 1 }) },
    plan: { updateMany: vi.fn().mockResolvedValue({ count: 2 }) },
    task: { updateMany: vi.fn().mockResolvedValue({ count: 3 }) },
    auditLog: { create: vi.fn().mockResolvedValue({ id: 'audit-id' }) },
  };
  const prisma = {
    $transaction: vi.fn(async (operation: (client: typeof tx) => Promise<unknown>) =>
      operation(tx),
    ),
  };
  return { service: new PetsService(prisma as never, {} as never), prisma, tx };
}

describe('PetsService.remove', () => {
  it('在同一事务中软删除猫咪、停用计划、取消待办并写审计日志', async () => {
    const { service, prisma, tx } = fixture();

    await service.remove('family-id', 'actor-id', 'pet-id', 7);

    expect(prisma.$transaction).toHaveBeenCalledOnce();
    expect(tx.pet.updateMany).toHaveBeenCalledWith({
      where: { id: 'pet-id', familyId: 'family-id', version: 7, deletedAt: null },
      data: { deletedAt: expect.any(Date), version: { increment: 1 } },
    });
    expect(tx.plan.updateMany).toHaveBeenCalledWith({
      where: { familyId: 'family-id', petId: 'pet-id', enabled: true, deletedAt: null },
      data: { enabled: false, version: { increment: 1 } },
    });
    expect(tx.task.updateMany).toHaveBeenCalledWith({
      where: { familyId: 'family-id', petId: 'pet-id', status: 'PENDING', deletedAt: null },
      data: { status: 'CANCELLED', version: { increment: 1 } },
    });
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        familyId: 'family-id',
        actorUserId: 'actor-id',
        action: 'pet.delete',
        resourceType: 'pet',
        resourceId: 'pet-id',
        beforeSafe: { deletedAt: null, version: 7 },
        afterSafe: expect.objectContaining({
          version: 8,
          plansDisabled: 2,
          tasksCancelled: 3,
        }),
      }),
    });
  });

  it('乐观锁失败时中止事务，不修改关联数据也不写审计', async () => {
    const { service, tx } = fixture({ petUpdateCount: 0 });

    await expect(service.remove('family-id', 'actor-id', 'pet-id', 7)).rejects.toMatchObject({
      code: 'VERSION_CONFLICT',
      status: 409,
    });
    expect(tx.plan.updateMany).not.toHaveBeenCalled();
    expect(tx.task.updateMany).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });
});

describe('PetsService birth date boundary', () => {
  it('rejects tomorrow according to the family timezone before writing the pet', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-12T16:05:00.000Z'));
    try {
      const prisma = {
        family: {
          findUniqueOrThrow: vi.fn().mockResolvedValue({ timezone: 'Asia/Shanghai' }),
        },
        pet: { updateMany: vi.fn() },
      };
      const service = new PetsService(prisma as never, {} as never);

      await expect(
        service.update('family-id', 'pet-id', { birthDate: '2026-07-14', version: 1 }),
      ).rejects.toMatchObject({ code: 'BIRTH_DATE_IN_FUTURE', status: 422 });
      expect(prisma.pet.updateMany).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
