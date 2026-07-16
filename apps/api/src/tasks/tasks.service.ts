import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma, RecordSource, RecordStatus, RecordType, TaskStatus } from '@prisma/client';
import { getLocalDayBounds } from '@cat-diary/domain';
import { randomUUID } from 'node:crypto';
import { AppException } from '../common/app.exception';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TasksService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    familyId: string,
    scope: 'today' | 'upcoming' | 'overdue' | 'completed',
    filters: { petId?: string; assigneeId?: string; cursor?: string; limit: number },
  ) {
    const family = await this.prisma.family.findUniqueOrThrow({
      where: { id: familyId },
      select: { timezone: true },
    });
    const now = new Date();
    const day = getLocalDayBounds(family.timezone, now);
    const scopeWhere: Prisma.TaskWhereInput =
      scope === 'today'
        ? { status: TaskStatus.PENDING, scheduledAt: { gte: day.start, lte: day.end } }
        : scope === 'upcoming'
          ? { status: TaskStatus.PENDING, scheduledAt: { gt: day.end } }
          : scope === 'overdue'
            ? { status: TaskStatus.PENDING, scheduledAt: { lt: now } }
            : { status: { in: [TaskStatus.COMPLETED, TaskStatus.SKIPPED] } };
    const rows = await this.prisma.task.findMany({
      where: {
        familyId,
        deletedAt: null,
        ...scopeWhere,
        ...(filters.petId ? { petId: filters.petId } : {}),
        ...(filters.assigneeId ? { assigneeId: filters.assigneeId } : {}),
      },
      orderBy: [{ scheduledAt: 'asc' }, { id: 'asc' }],
      take: filters.limit + 1,
      ...(filters.cursor ? { cursor: { id: filters.cursor }, skip: 1 } : {}),
      include: {
        pet: { select: { id: true, name: true } },
        assignee: { select: { id: true, displayName: true } },
      },
    });
    const hasMore = rows.length > filters.limit;
    const items = hasMore ? rows.slice(0, filters.limit) : rows;
    return { items, page: { hasMore, nextCursor: hasMore ? (items.at(-1)?.id ?? null) : null } };
  }

  async get(familyId: string, id: string) {
    const task = await this.prisma.task.findFirst({
      where: { id, familyId, deletedAt: null },
      include: { pet: true, plan: true, record: true },
    });
    if (!task) throw new AppException('TASK_NOT_FOUND', '任务不存在', HttpStatus.NOT_FOUND);
    return task;
  }

  async complete(
    familyId: string,
    id: string,
    userId: string,
    input: {
      actualAt: string;
      result?: unknown;
      note?: string;
      version: number;
      medicalConfirmed?: boolean;
    },
  ) {
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const task = await tx.task.findFirst({ where: { id, familyId, deletedAt: null } });
          if (!task) throw new AppException('TASK_NOT_FOUND', '任务不存在', HttpStatus.NOT_FOUND);
          if (task.status === TaskStatus.COMPLETED)
            throw new AppException('TASK_ALREADY_COMPLETED', '任务已经完成', HttpStatus.CONFLICT);
          const isMedical =
            task.type === RecordType.MEDICATION ||
            task.type === RecordType.VACCINE ||
            task.type === RecordType.DEWORMING;
          if (isMedical && !input.medicalConfirmed) {
            throw new AppException(
              'MEDICAL_CONFIRMATION_REQUIRED',
              '医疗任务完成前需要确认',
              HttpStatus.UNPROCESSABLE_ENTITY,
            );
          }
          const actualAt = new Date(input.actualAt);
          const updated = await tx.task.updateMany({
            where: { id, familyId, status: TaskStatus.PENDING, version: input.version },
            data: {
              status: TaskStatus.COMPLETED,
              completedAt: actualAt,
              completedById: userId,
              result: (input.result ?? {}) as Prisma.InputJsonValue,
              note: input.note?.trim() || null,
              version: { increment: 1 },
            },
          });
          if (!updated.count)
            throw new AppException('VERSION_CONFLICT', '任务已被其他成员处理', HttpStatus.CONFLICT);
          const record = await tx.record.upsert({
            where: { taskId: id },
            create: {
              clientId: `task:${id}:${randomUUID()}`,
              familyId,
              petId: task.petId,
              taskId: id,
              authorId: userId,
              type: task.type,
              title: task.title,
              source: RecordSource.TASK,
              status: RecordStatus.ACTIVE,
              occurredAt: actualAt,
              data: (input.result ?? {}) as Prisma.InputJsonValue,
              note: input.note?.trim() || null,
            },
            update: {
              authorId: userId,
              status: RecordStatus.ACTIVE,
              occurredAt: actualAt,
              data: (input.result ?? {}) as Prisma.InputJsonValue,
              note: input.note?.trim() || null,
              deletedAt: null,
              version: { increment: 1 },
            },
          });
          const completedTask = await tx.task.findUniqueOrThrow({ where: { id } });
          return { task: completedTask, record };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (isPrismaWriteConflict(error))
        throw new AppException('VERSION_CONFLICT', '任务已被其他成员处理', HttpStatus.CONFLICT);
      throw error;
    }
  }

  async skip(
    familyId: string,
    id: string,
    userId: string,
    input: { note?: string; version: number },
  ) {
    const result = await this.prisma.task.updateMany({
      where: { id, familyId, status: TaskStatus.PENDING, version: input.version, deletedAt: null },
      data: {
        status: TaskStatus.SKIPPED,
        completedById: userId,
        completedAt: new Date(),
        note: input.note?.trim() || null,
        version: { increment: 1 },
      },
    });
    if (!result.count)
      throw new AppException('VERSION_CONFLICT', '任务已被其他成员处理', HttpStatus.CONFLICT);
    return this.get(familyId, id);
  }

  async undo(familyId: string, id: string, version: number) {
    return this.prisma.$transaction(
      async (tx) => {
        const task = await tx.task.findFirst({ where: { id, familyId, deletedAt: null } });
        if (!task) throw new AppException('TASK_NOT_FOUND', '任务不存在', HttpStatus.NOT_FOUND);
        if (task.status !== TaskStatus.COMPLETED && task.status !== TaskStatus.SKIPPED)
          throw new AppException(
            'TASK_NOT_UNDOABLE',
            '当前任务状态不能撤销',
            HttpStatus.UNPROCESSABLE_ENTITY,
          );
        const result = await tx.task.updateMany({
          where: { id, familyId, version, status: task.status },
          data: {
            status: TaskStatus.PENDING,
            completedAt: null,
            completedById: null,
            result: Prisma.DbNull,
            note: null,
            version: { increment: 1 },
          },
        });
        if (!result.count)
          throw new AppException('VERSION_CONFLICT', '任务已被其他成员修改', HttpStatus.CONFLICT);
        await tx.record.updateMany({
          where: { taskId: id, status: RecordStatus.ACTIVE },
          data: { status: RecordStatus.REVERSED, version: { increment: 1 } },
        });
        return tx.task.findUniqueOrThrow({ where: { id } });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async assign(familyId: string, id: string, assigneeId: string | null, version: number) {
    if (assigneeId) {
      const member = await this.prisma.membership.count({
        where: { familyId, userId: assigneeId, status: 'ACTIVE' },
      });
      if (!member)
        throw new AppException(
          'ASSIGNEE_NOT_MEMBER',
          '负责人不是当前家庭成员',
          HttpStatus.UNPROCESSABLE_ENTITY,
        );
    }
    const result = await this.prisma.task.updateMany({
      where: { id, familyId, version, deletedAt: null },
      data: { assigneeId, version: { increment: 1 } },
    });
    if (!result.count)
      throw new AppException('VERSION_CONFLICT', '任务已被其他成员修改', HttpStatus.CONFLICT);
    return this.get(familyId, id);
  }
}

function isPrismaWriteConflict(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034';
}
