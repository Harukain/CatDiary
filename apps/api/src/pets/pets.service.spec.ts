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

describe('PetsService profile aggregation', () => {
  it('builds a single-pet profile summary from records, medical data, events and photos', async () => {
    const photos = {
      avatarUrlForObjectKey: vi.fn(),
      list: vi.fn().mockResolvedValue({
        items: [{ id: 'photo-id', thumbnailUrl: '/photos/photo-id/thumbnail' }],
        nextCursor: null,
      }),
    };
    const prisma = {
      pet: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'pet-id',
          familyId: 'family-id',
          name: '栗子',
          sex: 'FEMALE',
          birthDate: null,
          breed: null,
          neutered: true,
          chipNumber: null,
          avatarKey: null,
          version: 3,
          createdAt: new Date('2026-07-01T00:00:00Z'),
          updatedAt: new Date('2026-07-02T00:00:00Z'),
        }),
        count: vi.fn().mockResolvedValue(1),
      },
      family: {
        findUniqueOrThrow: vi.fn().mockResolvedValue({ timezone: 'Asia/Shanghai' }),
      },
      record: {
        findMany: vi
          .fn()
          .mockResolvedValueOnce([
            {
              id: 'food-record',
              type: 'FOOD',
              title: '早餐',
              abnormal: false,
              occurredAt: new Date('2026-07-12T00:30:00Z'),
              data: { foodName: '猫粮' },
              note: null,
            },
          ])
          .mockResolvedValueOnce([
            {
              id: 'weight-1',
              occurredAt: new Date('2026-07-12T00:00:00Z'),
              data: { weightKg: 4.1 },
            },
            {
              id: 'weight-2',
              occurredAt: new Date('2026-07-12T12:00:00Z'),
              data: { weightKg: 4.25 },
            },
          ]),
        count: vi.fn().mockResolvedValue(2),
      },
      medicalRecord: {
        findMany: vi
          .fn()
          .mockResolvedValueOnce([{ id: 'medical-id', type: 'VACCINE', title: '猫三联' }])
          .mockResolvedValueOnce([{ id: 'due-id', type: 'DEWORMING', title: '体内驱虫' }]),
        count: vi.fn().mockResolvedValueOnce(1).mockResolvedValueOnce(2).mockResolvedValueOnce(3),
      },
      healthEvent: {
        findMany: vi.fn().mockResolvedValue([{ id: 'event-id', title: '软便观察' }]),
      },
      plan: { count: vi.fn().mockResolvedValue(4) },
      task: { count: vi.fn().mockResolvedValueOnce(5).mockResolvedValueOnce(1) },
    };
    const service = new PetsService(prisma as never, photos as never);

    const summary = await service.profileSummary('family-id', 'pet-id');

    expect(summary.pet.name).toBe('栗子');
    expect(summary.care).toEqual({ activePlanCount: 4, pendingTaskCount: 5, overdueTaskCount: 1 });
    expect(summary.weight.latest).toMatchObject({
      recordId: 'weight-2',
      weightKg: 4.25,
      bucket: '2026-07-12',
    });
    expect(summary.medical.counts).toEqual({ vaccines: 1, deworming: 2, medications: 3 });
    expect(summary.medical.latestRecords).toHaveLength(1);
    expect(summary.medical.nextDue).toHaveLength(1);
    expect(summary.health).toMatchObject({ abnormalRecordCount30d: 2 });
    expect(summary.photos).toEqual([
      { id: 'photo-id', thumbnailUrl: '/photos/photo-id/thumbnail' },
    ]);
    expect(photos.list).toHaveBeenCalledWith('family-id', { petId: 'pet-id', limit: 6 });
    expect(prisma.record.findMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: expect.objectContaining({ familyId: 'family-id', petId: 'pet-id' }),
        take: 8,
      }),
    );
  });

  it('groups weight trend by the family local day and keeps the latest point per day', async () => {
    const prisma = {
      pet: { count: vi.fn().mockResolvedValue(1) },
      family: { findUniqueOrThrow: vi.fn().mockResolvedValue({ timezone: 'Asia/Shanghai' }) },
      record: {
        findMany: vi.fn().mockResolvedValue([
          { id: 'w1', occurredAt: new Date('2026-07-12T00:00:00Z'), data: { weightKg: 4.1 } },
          { id: 'w2', occurredAt: new Date('2026-07-12T12:00:00Z'), data: { weightKg: 4.2 } },
          { id: 'bad', occurredAt: new Date('2026-07-13T00:00:00Z'), data: { value: 4.3 } },
        ]),
      },
    };
    const service = new PetsService(prisma as never, {} as never);

    const trend = await service.weightTrend('family-id', 'pet-id', { bucket: 'day' });

    expect(trend).toMatchObject({
      petId: 'pet-id',
      bucket: 'day',
      timezone: 'Asia/Shanghai',
      points: [{ recordId: 'w2', weightKg: 4.2, bucket: '2026-07-12' }],
    });
    expect(prisma.record.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ type: 'WEIGHT', status: 'ACTIVE', deletedAt: null }),
        take: 100,
      }),
    );
  });

  it('rejects weight trend reads for a pet outside the current family', async () => {
    const prisma = {
      pet: { count: vi.fn().mockResolvedValue(0) },
      family: { findUniqueOrThrow: vi.fn().mockResolvedValue({ timezone: 'Asia/Shanghai' }) },
      record: { findMany: vi.fn() },
    };
    const service = new PetsService(prisma as never, {} as never);

    await expect(
      service.weightTrend('family-id', 'pet-id', { bucket: 'raw' }),
    ).rejects.toMatchObject({
      code: 'PET_NOT_FOUND',
      status: 404,
    });
    expect(prisma.record.findMany).not.toHaveBeenCalled();
  });
});
