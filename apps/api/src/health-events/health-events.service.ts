import { HttpStatus, Injectable } from '@nestjs/common';
import {
  FamilyRole,
  HealthEventRelationType,
  HealthEventStatus,
  Prisma,
  RecordStatus,
} from '@prisma/client';
import { AppException } from '../common/app.exception';
import { PrismaService } from '../prisma/prisma.service';

interface CreateHealthEventInput {
  petId: string;
  title: string;
  startedAt: string;
  summary?: string;
  recordIds: string[];
}

@Injectable()
export class HealthEventsService {
  constructor(private readonly prisma: PrismaService) {}

  list(familyId: string, filters: { petId?: string; status?: HealthEventStatus }) {
    return this.prisma.healthEvent.findMany({
      where: {
        familyId,
        deletedAt: null,
        ...(filters.petId ? { petId: filters.petId } : {}),
        ...(filters.status ? { status: filters.status } : {}),
      },
      orderBy: { startedAt: 'desc' },
      select: this.selection,
    });
  }

  async get(familyId: string, id: string) {
    const event = await this.prisma.healthEvent.findFirst({
      where: { id, familyId, deletedAt: null },
      select: this.selection,
    });
    if (!event)
      throw new AppException('HEALTH_EVENT_NOT_FOUND', '健康事件不存在', HttpStatus.NOT_FOUND);
    return event;
  }

  async create(familyId: string, userId: string, input: CreateHealthEventInput) {
    await this.requirePet(familyId, input.petId);
    const startedAt = new Date(input.startedAt);
    if (startedAt.getTime() > Date.now() + 5 * 60_000)
      throw new AppException(
        'FUTURE_STARTED_AT',
        '开始时间不能晚于当前时间',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    await this.requireRecords(familyId, input.petId, input.recordIds);
    return this.prisma.$transaction(async (tx) => {
      const event = await tx.healthEvent.create({
        data: {
          familyId,
          petId: input.petId,
          createdById: userId,
          title: input.title.trim(),
          summary: input.summary?.trim() || null,
          startedAt,
          records: {
            create: input.recordIds.map((recordId) => ({
              recordId,
              relationType: HealthEventRelationType.SYMPTOM,
            })),
          },
        },
      });
      await tx.auditLog.create({
        data: {
          familyId,
          actorUserId: userId,
          action: 'health_event.create',
          resourceType: 'health_event',
          resourceId: event.id,
          afterSafe: { petId: input.petId, recordCount: input.recordIds.length },
        },
      });
      return tx.healthEvent.findUniqueOrThrow({ where: { id: event.id }, select: this.selection });
    });
  }

  async update(
    familyId: string,
    userId: string,
    role: FamilyRole,
    id: string,
    input: { title?: string; summary?: string; startedAt?: string; version: number },
  ) {
    const current = await this.get(familyId, id);
    this.requireEditor(current.createdById, userId, role);
    if (input.startedAt && new Date(input.startedAt).getTime() > Date.now() + 5 * 60_000)
      throw new AppException(
        'FUTURE_STARTED_AT',
        '开始时间不能晚于当前时间',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    const result = await this.prisma.healthEvent.updateMany({
      where: { id, familyId, version: input.version, deletedAt: null },
      data: {
        ...(input.title !== undefined ? { title: input.title.trim() } : {}),
        ...(input.summary !== undefined ? { summary: input.summary.trim() || null } : {}),
        ...(input.startedAt ? { startedAt: new Date(input.startedAt) } : {}),
        version: { increment: 1 },
      },
    });
    if (!result.count)
      throw new AppException(
        'VERSION_CONFLICT',
        '健康事件已被其他成员修改',
        HttpStatus.CONFLICT,
        undefined,
        { serverVersion: (await this.get(familyId, id)).version },
      );
    return this.get(familyId, id);
  }

  async addRecord(
    familyId: string,
    userId: string,
    role: FamilyRole,
    id: string,
    recordId: string,
    relationType: HealthEventRelationType,
  ) {
    const event = await this.get(familyId, id);
    this.requireEditor(event.createdById, userId, role);
    await this.requireRecords(familyId, event.petId, [recordId]);
    await this.prisma.healthEventRecord.upsert({
      where: { healthEventId_recordId: { healthEventId: id, recordId } },
      create: { healthEventId: id, recordId, relationType },
      update: { relationType },
    });
    return this.get(familyId, id);
  }

  async removeRecord(
    familyId: string,
    userId: string,
    role: FamilyRole,
    id: string,
    recordId: string,
  ) {
    const event = await this.get(familyId, id);
    this.requireEditor(event.createdById, userId, role);
    await this.prisma.healthEventRecord.deleteMany({ where: { healthEventId: id, recordId } });
  }

  async recover(
    familyId: string,
    userId: string,
    role: FamilyRole,
    id: string,
    input: { recoveredAt: string; version: number },
  ) {
    const current = await this.get(familyId, id);
    this.requireEditor(current.createdById, userId, role);
    if (current.status === HealthEventStatus.RECOVERED) return current;
    const recoveredAt = new Date(input.recoveredAt);
    if (recoveredAt < current.startedAt || recoveredAt.getTime() > Date.now() + 5 * 60_000)
      throw new AppException(
        'INVALID_RECOVERED_AT',
        '恢复时间必须介于开始时间和当前时间之间',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    const result = await this.prisma.healthEvent.updateMany({
      where: {
        id,
        familyId,
        version: input.version,
        status: HealthEventStatus.ACTIVE,
        deletedAt: null,
      },
      data: { status: HealthEventStatus.RECOVERED, recoveredAt, version: { increment: 1 } },
    });
    if (!result.count)
      throw new AppException('VERSION_CONFLICT', '健康事件状态已变化', HttpStatus.CONFLICT);
    await this.prisma.auditLog.create({
      data: {
        familyId,
        actorUserId: userId,
        action: 'health_event.recover',
        resourceType: 'health_event',
        resourceId: id,
        afterSafe: { recoveredAt },
      },
    });
    return this.get(familyId, id);
  }

  private requireEditor(createdById: string, userId: string, role: FamilyRole) {
    if (createdById !== userId && role === FamilyRole.MEMBER)
      throw new AppException(
        'HEALTH_EVENT_EDIT_FORBIDDEN',
        '只能修改自己创建的健康事件',
        HttpStatus.FORBIDDEN,
      );
  }
  private async requirePet(familyId: string, petId: string) {
    if (!(await this.prisma.pet.count({ where: { id: petId, familyId, deletedAt: null } })))
      throw new AppException('PET_NOT_FOUND', '猫咪档案不存在', HttpStatus.NOT_FOUND);
  }
  private async requireRecords(familyId: string, petId: string, ids: string[]) {
    if (!ids.length) return;
    const count = await this.prisma.record.count({
      where: { id: { in: ids }, familyId, petId, status: RecordStatus.ACTIVE, deletedAt: null },
    });
    if (count !== new Set(ids).size)
      throw new AppException(
        'RECORD_LINK_INVALID',
        '关联记录不存在或不属于该猫咪',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
  }

  private readonly selection = {
    id: true,
    familyId: true,
    petId: true,
    title: true,
    status: true,
    startedAt: true,
    recoveredAt: true,
    summary: true,
    version: true,
    createdById: true,
    createdAt: true,
    updatedAt: true,
    pet: { select: { id: true, name: true } },
    createdBy: { select: { id: true, displayName: true } },
    records: {
      orderBy: { createdAt: 'asc' },
      select: {
        relationType: true,
        record: {
          select: {
            id: true,
            type: true,
            title: true,
            occurredAt: true,
            abnormal: true,
            data: true,
            note: true,
          },
        },
      },
    },
  } satisfies Prisma.HealthEventSelect;
}
