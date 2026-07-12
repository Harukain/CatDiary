import { HttpStatus, Injectable } from '@nestjs/common';
import { FamilyRole, Prisma, RecordSource, RecordStatus, RecordType } from '@prisma/client';
import { AppException } from '../common/app.exception';
import { PrismaService } from '../prisma/prisma.service';

export interface RecordCreateInput {
  clientId: string;
  petId: string;
  type: RecordType;
  title: string;
  occurredAt: string;
  abnormal: boolean;
  data: unknown;
  note?: string;
}

@Injectable()
export class RecordsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    familyId: string,
    filters: {
      petId?: string;
      type?: RecordType;
      from?: string;
      to?: string;
      cursor?: string;
      limit: number;
    },
  ) {
    let cursorRecord: { occurredAt: Date; id: string } | null = null;
    if (filters.cursor)
      cursorRecord = await this.prisma.record.findFirst({
        where: { id: filters.cursor, familyId },
        select: { id: true, occurredAt: true },
      });
    const records = await this.prisma.record.findMany({
      where: {
        familyId,
        status: RecordStatus.ACTIVE,
        deletedAt: null,
        ...(filters.petId ? { petId: filters.petId } : {}),
        ...(filters.type ? { type: filters.type } : {}),
        ...(filters.from || filters.to
          ? {
              occurredAt: {
                ...(filters.from ? { gte: new Date(filters.from) } : {}),
                ...(filters.to ? { lte: new Date(filters.to) } : {}),
              },
            }
          : {}),
        ...(cursorRecord
          ? {
              OR: [
                { occurredAt: { lt: cursorRecord.occurredAt } },
                { occurredAt: cursorRecord.occurredAt, id: { lt: cursorRecord.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
      take: filters.limit + 1,
      select: this.selection,
    });
    const hasMore = records.length > filters.limit;
    if (hasMore) records.pop();
    return { items: records, nextCursor: hasMore ? (records.at(-1)?.id ?? null) : null };
  }

  async get(familyId: string, id: string, includeDeleted = false) {
    const record = await this.prisma.record.findFirst({
      where: {
        id,
        familyId,
        ...(includeDeleted ? {} : { status: RecordStatus.ACTIVE, deletedAt: null }),
      },
      select: this.selection,
    });
    if (!record) throw new AppException('RECORD_NOT_FOUND', '记录不存在', HttpStatus.NOT_FOUND);
    return record;
  }

  async create(familyId: string, userId: string, input: RecordCreateInput) {
    await this.requirePet(familyId, input.petId);
    const occurredAt = new Date(input.occurredAt);
    if (occurredAt.getTime() > Date.now() + 5 * 60_000)
      throw new AppException(
        'FUTURE_OCCURRED_AT',
        '发生时间不能晚于当前时间',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    return this.prisma.record.upsert({
      where: { familyId_clientId: { familyId, clientId: input.clientId } },
      create: {
        familyId,
        authorId: userId,
        petId: input.petId,
        clientId: input.clientId,
        type: input.type,
        title: input.title.trim(),
        occurredAt,
        abnormal: input.abnormal,
        data: input.data as Prisma.InputJsonValue,
        note: input.note?.trim() || null,
      },
      update: {},
      select: this.selection,
    });
  }

  async update(
    familyId: string,
    userId: string,
    role: FamilyRole,
    id: string,
    input: Partial<Omit<RecordCreateInput, 'clientId' | 'type'>> & {
      version: number;
      data?: unknown;
    },
  ) {
    const current = await this.get(familyId, id);
    if (current.source === RecordSource.TASK)
      throw new AppException(
        'TASK_RECORD_IMMUTABLE',
        '任务生成的记录请通过任务撤销后重新完成',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    if (current.authorId !== userId && role === FamilyRole.MEMBER)
      throw new AppException(
        'RECORD_EDIT_FORBIDDEN',
        '只能编辑自己创建的记录',
        HttpStatus.FORBIDDEN,
      );
    if (input.petId) await this.requirePet(familyId, input.petId);
    if (input.occurredAt && new Date(input.occurredAt).getTime() > Date.now() + 5 * 60_000)
      throw new AppException(
        'FUTURE_OCCURRED_AT',
        '发生时间不能晚于当前时间',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    const result = await this.prisma.record.updateMany({
      where: { id, familyId, version: input.version, status: RecordStatus.ACTIVE, deletedAt: null },
      data: {
        ...(input.petId ? { petId: input.petId } : {}),
        ...(input.title !== undefined ? { title: input.title.trim() } : {}),
        ...(input.occurredAt ? { occurredAt: new Date(input.occurredAt) } : {}),
        ...(input.abnormal !== undefined ? { abnormal: input.abnormal } : {}),
        ...(input.data !== undefined ? { data: input.data as Prisma.InputJsonValue } : {}),
        ...(input.note !== undefined ? { note: input.note.trim() || null } : {}),
        version: { increment: 1 },
      },
    });
    if (!result.count)
      throw new AppException(
        'VERSION_CONFLICT',
        '记录已被其他成员修改',
        HttpStatus.CONFLICT,
        undefined,
        { serverVersion: (await this.get(familyId, id)).version },
      );
    return this.get(familyId, id);
  }

  async remove(familyId: string, userId: string, role: FamilyRole, id: string, version: number) {
    const current = await this.get(familyId, id);
    if (current.authorId !== userId && role === FamilyRole.MEMBER)
      throw new AppException(
        'RECORD_DELETE_FORBIDDEN',
        '只能删除自己创建的记录',
        HttpStatus.FORBIDDEN,
      );
    const now = new Date();
    const result = await this.prisma.record.updateMany({
      where: { id, familyId, version, status: RecordStatus.ACTIVE, deletedAt: null },
      data: { status: RecordStatus.DELETED, deletedAt: now, version: { increment: 1 } },
    });
    if (!result.count)
      throw new AppException('VERSION_CONFLICT', '记录已被修改', HttpStatus.CONFLICT);
    await this.audit(familyId, userId, 'record.delete', id, {
      type: current.type,
      occurredAt: current.occurredAt,
    });
  }

  async restore(familyId: string, userId: string, id: string) {
    const current = await this.get(familyId, id, true);
    if (
      current.status !== RecordStatus.DELETED ||
      !current.deletedAt ||
      current.deletedAt.getTime() < Date.now() - 30 * 86_400_000
    )
      throw new AppException(
        'RESTORE_WINDOW_EXPIRED',
        '记录不在 30 天可恢复期内',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    const restored = await this.prisma.record.update({
      where: { id },
      data: { status: RecordStatus.ACTIVE, deletedAt: null, version: { increment: 1 } },
      select: this.selection,
    });
    await this.audit(familyId, userId, 'record.restore', id, { type: current.type });
    return restored;
  }

  private async requirePet(familyId: string, petId: string) {
    if (!(await this.prisma.pet.count({ where: { id: petId, familyId, deletedAt: null } })))
      throw new AppException('PET_NOT_FOUND', '猫咪档案不存在', HttpStatus.NOT_FOUND);
  }

  private audit(
    familyId: string,
    actorUserId: string,
    action: string,
    resourceId: string,
    beforeSafe: Prisma.InputJsonValue,
  ) {
    return this.prisma.auditLog.create({
      data: { familyId, actorUserId, action, resourceType: 'record', resourceId, beforeSafe },
    });
  }

  private readonly selection = {
    id: true,
    clientId: true,
    familyId: true,
    petId: true,
    taskId: true,
    authorId: true,
    type: true,
    title: true,
    source: true,
    status: true,
    abnormal: true,
    occurredAt: true,
    data: true,
    note: true,
    version: true,
    createdAt: true,
    updatedAt: true,
    deletedAt: true,
    pet: { select: { id: true, name: true } },
    author: { select: { id: true, displayName: true } },
  } satisfies Prisma.RecordSelect;
}
