import { Prisma, RecordSource, RecordStatus, RecordType, TaskStatus } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { TasksService } from './tasks.service';

function task(
  overrides: Partial<{
    id: string;
    familyId: string;
    petId: string | null;
    type: RecordType;
    status: TaskStatus;
    version: number;
  }> = {},
) {
  return {
    id: 'task-id',
    familyId: 'family-id',
    planId: 'plan-id',
    petId: 'pet-id',
    createdById: 'owner-id',
    assigneeId: null,
    completedById: null,
    title: '清理猫砂盆',
    detail: '观察排便情况',
    type: RecordType.LITTER,
    scheduledAt: new Date('2026-07-17T02:00:00.000Z'),
    status: TaskStatus.PENDING,
    completedAt: null,
    result: Prisma.DbNull,
    note: null,
    version: 1,
    createdAt: new Date('2026-07-17T00:00:00.000Z'),
    updatedAt: new Date('2026-07-17T00:00:00.000Z'),
    deletedAt: null,
    ...overrides,
  };
}

function generatedRecord(overrides: Partial<{ taskId: string; type: RecordType }> = {}) {
  return {
    id: 'record-id',
    clientId: 'task:task-id:client-id',
    familyId: 'family-id',
    petId: 'pet-id',
    taskId: 'task-id',
    authorId: 'member-id',
    type: RecordType.LITTER,
    title: '清理猫砂盆',
    source: RecordSource.TASK,
    status: RecordStatus.ACTIVE,
    abnormal: false,
    occurredAt: new Date('2026-07-17T03:00:00.000Z'),
    data: { summary: '已清理猫砂盆' },
    note: '状态正常',
    version: 1,
    createdAt: new Date('2026-07-17T03:00:00.000Z'),
    updatedAt: new Date('2026-07-17T03:00:00.000Z'),
    deletedAt: null,
    ...overrides,
  };
}

function fixture(current = task()) {
  const completed = {
    ...current,
    status: TaskStatus.COMPLETED,
    completedAt: new Date('2026-07-17T03:00:00.000Z'),
    completedById: 'member-id',
    result: { summary: '已清理猫砂盆' },
    note: '状态正常',
    version: current.version + 1,
  };
  const prisma = {
    task: {
      findFirst: vi.fn().mockResolvedValue(current),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      findUniqueOrThrow: vi.fn().mockResolvedValue(completed),
    },
    record: {
      upsert: vi.fn().mockResolvedValue(generatedRecord({ type: current.type })),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    $transaction: vi.fn(),
  };
  prisma.$transaction.mockImplementation(
    async (operation: (client: typeof prisma) => Promise<unknown>) => operation(prisma),
  );
  return { service: new TasksService(prisma as never), prisma, completed };
}

describe('TasksService completion lifecycle', () => {
  it('completes a pending task and creates the generated task record in one transaction', async () => {
    const { service, prisma } = fixture();
    const actualAt = '2026-07-17T03:00:00.000Z';

    const result = await service.complete('family-id', 'task-id', 'member-id', {
      actualAt,
      result: { summary: '已清理猫砂盆' },
      note: '状态正常',
      version: 1,
    });

    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
    expect(prisma.task.updateMany).toHaveBeenCalledWith({
      where: { id: 'task-id', familyId: 'family-id', status: TaskStatus.PENDING, version: 1 },
      data: expect.objectContaining({
        status: TaskStatus.COMPLETED,
        completedById: 'member-id',
        note: '状态正常',
        version: { increment: 1 },
      }),
    });
    expect(prisma.record.upsert).toHaveBeenCalledWith({
      where: { taskId: 'task-id' },
      create: expect.objectContaining({
        familyId: 'family-id',
        petId: 'pet-id',
        taskId: 'task-id',
        authorId: 'member-id',
        source: RecordSource.TASK,
        status: RecordStatus.ACTIVE,
        data: { summary: '已清理猫砂盆' },
        note: '状态正常',
      }),
      update: expect.objectContaining({
        authorId: 'member-id',
        status: RecordStatus.ACTIVE,
        deletedAt: null,
        version: { increment: 1 },
      }),
    });
    expect(result.record.id).toBe('record-id');
    expect(result.task.status).toBe(TaskStatus.COMPLETED);
  });

  it('requires explicit confirmation before completing a medical task', async () => {
    const { service, prisma } = fixture(task({ type: RecordType.MEDICATION }));

    await expect(
      service.complete('family-id', 'task-id', 'member-id', {
        actualAt: '2026-07-17T03:00:00.000Z',
        result: { summary: '已完成用药' },
        version: 1,
      }),
    ).rejects.toMatchObject({ code: 'MEDICAL_CONFIRMATION_REQUIRED', status: 422 });
    expect(prisma.task.updateMany).not.toHaveBeenCalled();
    expect(prisma.record.upsert).not.toHaveBeenCalled();
  });

  it('undoes a completed task and reverses its generated active record', async () => {
    const pending = task({ status: TaskStatus.COMPLETED, version: 2 });
    const { service, prisma } = fixture(pending);
    prisma.task.findUniqueOrThrow.mockResolvedValue({
      ...pending,
      status: TaskStatus.PENDING,
      completedAt: null,
      completedById: null,
      result: Prisma.DbNull,
      note: null,
      version: 3,
    });

    const result = await service.undo('family-id', 'task-id', 2);

    expect(prisma.task.updateMany).toHaveBeenCalledWith({
      where: { id: 'task-id', familyId: 'family-id', version: 2, status: TaskStatus.COMPLETED },
      data: expect.objectContaining({
        status: TaskStatus.PENDING,
        completedAt: null,
        completedById: null,
        note: null,
        version: { increment: 1 },
      }),
    });
    expect(prisma.record.updateMany).toHaveBeenCalledWith({
      where: { taskId: 'task-id', status: RecordStatus.ACTIVE },
      data: { status: RecordStatus.REVERSED, version: { increment: 1 } },
    });
    expect(result.status).toBe(TaskStatus.PENDING);
  });
});
