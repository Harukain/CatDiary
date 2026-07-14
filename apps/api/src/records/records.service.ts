import { HttpStatus, Injectable } from '@nestjs/common';
import {
  FamilyRole,
  PhotoStatus,
  Prisma,
  RecordSource,
  RecordStatus,
  RecordType,
} from '@prisma/client';
import { AppException } from '../common/app.exception';
import { PhotosService } from '../photos/photos.service';
import { PrismaService } from '../prisma/prisma.service';

export interface RecordCreateInput {
  clientId: string;
  petId: string | null;
  type: RecordType;
  title: string;
  occurredAt: string;
  abnormal: boolean;
  data: unknown;
  note?: string;
}

@Injectable()
export class RecordsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly photos: PhotosService,
  ) {}

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
    return {
      items: await Promise.all(records.map((record) => this.presentRecord(record))),
      nextCursor: hasMore ? (records.at(-1)?.id ?? null) : null,
    };
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
    return this.presentRecord(record);
  }

  async create(familyId: string, userId: string, input: RecordCreateInput) {
    await this.requirePetScope(familyId, input.type, input.petId);
    const photoIds = input.type === RecordType.PHOTO ? this.photoIdsFromData(input.data) : [];
    if (input.type === RecordType.PHOTO)
      await this.requirePhotoScope(familyId, input.petId, photoIds);
    const occurredAt = new Date(input.occurredAt);
    if (occurredAt.getTime() > Date.now() + 5 * 60_000)
      throw new AppException(
        'FUTURE_OCCURRED_AT',
        '发生时间不能晚于当前时间',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    const recordId = await this.prisma.$transaction(async (tx) => {
      const created = await tx.record.upsert({
        where: { familyId_clientId: { familyId, clientId: input.clientId } },
        create: {
          familyId,
          authorId: userId,
          petId: input.petId ?? null,
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
      if (input.type === RecordType.PHOTO) await this.replacePhotoLinks(tx, created.id, photoIds);
      return created.id;
    });
    return this.get(familyId, recordId);
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
    this.requireMutationPermission(current, userId, role, 'edit');
    if (input.petId !== undefined) await this.requirePetScope(familyId, current.type, input.petId);
    if (input.occurredAt && new Date(input.occurredAt).getTime() > Date.now() + 5 * 60_000)
      throw new AppException(
        'FUTURE_OCCURRED_AT',
        '发生时间不能晚于当前时间',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    const result = await this.prisma.record.updateMany({
      where: { id, familyId, version: input.version, status: RecordStatus.ACTIVE, deletedAt: null },
      data: {
        ...(input.petId !== undefined ? { petId: input.petId } : {}),
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
    this.requireMutationPermission(current, userId, role, 'delete');
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
    return this.presentRecord(restored);
  }

  private async presentRecord<
    T extends {
      photos?: Array<{
        photo: {
          id: string;
          objectKey: string;
          thumbnailObjectKey?: string | null;
          width?: number | null;
          height?: number | null;
          note?: string | null;
          createdAt?: Date | string;
        };
      }>;
    },
  >(record: T) {
    const { photos = [], ...rest } = record;
    return {
      ...rest,
      photos: await Promise.all(photos.map(({ photo }) => this.photos.recordSummary(photo))),
    };
  }

  private async requirePetScope(familyId: string, type: RecordType, petId: string | null) {
    if (petId) {
      await this.requirePet(familyId, petId);
      return;
    }
    if (type !== RecordType.LITTER)
      throw new AppException('PET_REQUIRED', '该记录必须选择猫咪', HttpStatus.UNPROCESSABLE_ENTITY);
  }

  private photoIdsFromData(data: unknown) {
    const photoIds =
      data && typeof data === 'object' && Array.isArray((data as { photoIds?: unknown }).photoIds)
        ? (data as { photoIds: unknown[] }).photoIds
        : null;
    if (!photoIds?.length)
      throw new AppException(
        'PHOTO_IDS_REQUIRED',
        '照片记录必须包含照片',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    const values = photoIds.map(String);
    if (new Set(values).size !== values.length)
      throw new AppException(
        'PHOTO_IDS_DUPLICATED',
        '照片不能重复',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    return values;
  }

  private async requirePhotoScope(familyId: string, petId: string | null, photoIds: string[]) {
    if (!petId)
      throw new AppException('PET_REQUIRED', '该记录必须选择猫咪', HttpStatus.UNPROCESSABLE_ENTITY);
    const count = await this.prisma.photo.count({
      where: {
        id: { in: photoIds },
        familyId,
        status: PhotoStatus.ACTIVE,
        deletedAt: null,
        pets: { some: { petId } },
      },
    });
    if (count !== photoIds.length)
      throw new AppException(
        'PHOTO_RECORD_SCOPE_INVALID',
        '照片不存在或未绑定当前猫咪',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
  }

  private async replacePhotoLinks(
    tx: Prisma.TransactionClient,
    recordId: string,
    photoIds: string[],
  ) {
    await tx.photoRecord.deleteMany({ where: { recordId } });
    await tx.photoRecord.createMany({
      data: photoIds.map((photoId) => ({ photoId, recordId })),
      skipDuplicates: true,
    });
  }

  private async requirePet(familyId: string, petId: string) {
    if (!(await this.prisma.pet.count({ where: { id: petId, familyId, deletedAt: null } })))
      throw new AppException('PET_NOT_FOUND', '猫咪档案不存在', HttpStatus.NOT_FOUND);
  }

  private requireMutationPermission(
    record: { authorId: string; source: RecordSource; type: RecordType },
    userId: string,
    role: FamilyRole,
    action: 'edit' | 'delete',
  ) {
    if (record.source === RecordSource.TASK)
      throw new AppException(
        'TASK_RECORD_IMMUTABLE',
        '任务生成的记录请通过任务撤销后重新完成',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );

    if (role === FamilyRole.OWNER || role === FamilyRole.ADMIN) return;

    if (this.isMedicalRecord(record.type))
      throw new AppException(
        action === 'edit' ? 'MEDICAL_RECORD_EDIT_FORBIDDEN' : 'MEDICAL_RECORD_DELETE_FORBIDDEN',
        action === 'edit' ? '医疗类记录仅家庭管理员可修改' : '医疗类记录仅家庭管理员可删除',
        HttpStatus.FORBIDDEN,
      );

    if (record.authorId !== userId)
      throw new AppException(
        action === 'edit' ? 'RECORD_EDIT_FORBIDDEN' : 'RECORD_DELETE_FORBIDDEN',
        action === 'edit' ? '只能编辑自己创建的普通记录' : '只能删除自己创建的普通记录',
        HttpStatus.FORBIDDEN,
      );
  }

  private isMedicalRecord(type: RecordType) {
    return (
      type === RecordType.MEDICATION || type === RecordType.VACCINE || type === RecordType.DEWORMING
    );
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
    photos: {
      orderBy: { createdAt: 'asc' },
      select: {
        photo: {
          select: {
            id: true,
            objectKey: true,
            thumbnailObjectKey: true,
            width: true,
            height: true,
            note: true,
            createdAt: true,
          },
        },
      },
    },
  } satisfies Prisma.RecordSelect;
}
