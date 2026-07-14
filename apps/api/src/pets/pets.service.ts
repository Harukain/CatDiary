import { HttpStatus, Injectable } from '@nestjs/common';
import {
  HealthEventStatus,
  MedicalRecordType,
  Prisma,
  RecordStatus,
  RecordType,
} from '@prisma/client';
import { isCalendarDateOnOrBefore, MAX_PETS_PER_FAMILY } from '@cat-diary/domain';
import { AppException } from '../common/app.exception';
import { PrismaService } from '../prisma/prisma.service';
import { PhotosService } from '../photos/photos.service';

interface PetInput {
  name: string;
  sex?: 'MALE' | 'FEMALE' | 'UNKNOWN';
  birthDate?: string | null;
  breed?: string | null;
  neutered?: boolean | null;
  chipNumber?: string | null;
}

interface WeightTrendFilters {
  from?: string;
  to?: string;
  bucket: 'day' | 'raw';
}

@Injectable()
export class PetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly photos: PhotosService,
  ) {}

  async list(familyId: string) {
    const pets = await this.prisma.pet.findMany({
      where: { familyId, deletedAt: null },
      orderBy: { createdAt: 'asc' },
      select: this.selection,
    });
    return Promise.all(pets.map((pet) => this.withAvatar(familyId, pet)));
  }

  async get(familyId: string, id: string) {
    const pet = await this.prisma.pet.findFirst({
      where: { id, familyId, deletedAt: null },
      select: this.selection,
    });
    if (!pet) throw new AppException('PET_NOT_FOUND', '猫咪档案不存在', HttpStatus.NOT_FOUND);
    return this.withAvatar(familyId, pet);
  }

  async profileSummary(familyId: string, id: string) {
    const [pet, family] = await Promise.all([
      this.get(familyId, id),
      this.prisma.family.findUniqueOrThrow({ where: { id: familyId }, select: { timezone: true } }),
    ]);
    const now = new Date();
    const since30Days = new Date(now.getTime() - 30 * 86_400_000);
    const [
      recentRecords,
      weightTrend,
      latestMedicalRecords,
      nextMedicalDue,
      activeHealthEvents,
      recentPhotos,
      abnormalRecordCount30d,
      activePlanCount,
      pendingTaskCount,
      overdueTaskCount,
      medicalCounts,
    ] = await Promise.all([
      this.prisma.record.findMany({
        where: {
          familyId,
          petId: id,
          status: RecordStatus.ACTIVE,
          deletedAt: null,
          type: {
            in: [
              RecordType.FOOD,
              RecordType.WATER,
              RecordType.WEIGHT,
              RecordType.STOOL,
              RecordType.VOMIT,
              RecordType.MEDICATION,
            ],
          },
        },
        orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
        take: 8,
        select: this.recordSelection,
      }),
      this.weightTrend(familyId, id, { bucket: 'day' }),
      this.prisma.medicalRecord.findMany({
        where: { familyId, petId: id, deletedAt: null },
        orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
        take: 6,
        select: this.medicalRecordSelection,
      }),
      this.prisma.medicalRecord.findMany({
        where: { familyId, petId: id, deletedAt: null, nextDueAt: { gte: now } },
        orderBy: [{ nextDueAt: 'asc' }, { id: 'asc' }],
        take: 5,
        select: this.medicalRecordSelection,
      }),
      this.prisma.healthEvent.findMany({
        where: { familyId, petId: id, status: HealthEventStatus.ACTIVE, deletedAt: null },
        orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
        take: 5,
        select: this.healthEventSelection,
      }),
      this.photos.list(familyId, { petId: id, limit: 6 }),
      this.prisma.record.count({
        where: {
          familyId,
          petId: id,
          abnormal: true,
          status: RecordStatus.ACTIVE,
          deletedAt: null,
          occurredAt: { gte: since30Days },
        },
      }),
      this.prisma.plan.count({ where: { familyId, petId: id, enabled: true, deletedAt: null } }),
      this.prisma.task.count({
        where: { familyId, petId: id, status: 'PENDING', deletedAt: null },
      }),
      this.prisma.task.count({
        where: {
          familyId,
          petId: id,
          status: 'PENDING',
          deletedAt: null,
          scheduledAt: { lt: now },
        },
      }),
      this.medicalCounts(familyId, id),
    ]);
    return {
      generatedAt: now,
      timezone: family.timezone,
      pet,
      care: {
        activePlanCount,
        pendingTaskCount,
        overdueTaskCount,
      },
      weight: {
        latest: weightTrend.points.at(-1) ?? null,
        trend: weightTrend.points,
      },
      medical: {
        counts: medicalCounts,
        latestRecords: latestMedicalRecords,
        nextDue: nextMedicalDue,
      },
      health: {
        activeEvents: activeHealthEvents,
        abnormalRecordCount30d,
      },
      recentRecords,
      photos: recentPhotos.items,
    };
  }

  async weightTrend(familyId: string, id: string, filters: WeightTrendFilters) {
    const [petExists, family] = await Promise.all([
      this.prisma.pet.count({ where: { id, familyId, deletedAt: null } }),
      this.prisma.family.findUniqueOrThrow({ where: { id: familyId }, select: { timezone: true } }),
    ]);
    if (!petExists) throw new AppException('PET_NOT_FOUND', '猫咪档案不存在', HttpStatus.NOT_FOUND);
    const rows = await this.prisma.record.findMany({
      where: {
        familyId,
        petId: id,
        type: RecordType.WEIGHT,
        status: RecordStatus.ACTIVE,
        deletedAt: null,
        ...(filters.from || filters.to
          ? {
              occurredAt: {
                ...(filters.from ? { gte: new Date(filters.from) } : {}),
                ...(filters.to ? { lte: new Date(filters.to) } : {}),
              },
            }
          : {}),
      },
      orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
      take: 100,
      select: { id: true, occurredAt: true, data: true },
    });
    const points = rows
      .map((row) => {
        const weightKg = weightKgFromData(row.data);
        if (weightKg === null) return null;
        return {
          recordId: row.id,
          occurredAt: row.occurredAt,
          weightKg,
          bucket: localDateKey(row.occurredAt, family.timezone),
        };
      })
      .filter((point): point is NonNullable<typeof point> => !!point);
    const bucketed =
      filters.bucket === 'raw'
        ? points
        : Array.from(new Map(points.map((point) => [point.bucket, point])).values());
    return {
      petId: id,
      bucket: filters.bucket,
      timezone: family.timezone,
      points: bucketed,
    };
  }

  async create(familyId: string, userId: string, input: PetInput) {
    await this.assertBirthDate(familyId, input.birthDate);
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        return await this.prisma.$transaction(
          async (tx) => {
            const activeCount = await tx.pet.count({ where: { familyId, deletedAt: null } });
            if (activeCount >= MAX_PETS_PER_FAMILY) {
              throw new AppException(
                'PET_LIMIT_REACHED',
                `每个家庭最多管理 ${MAX_PETS_PER_FAMILY} 只猫咪`,
                HttpStatus.UNPROCESSABLE_ENTITY,
              );
            }
            return tx.pet.create({
              data: this.createData(familyId, userId, input),
              select: this.selection,
            });
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2034' &&
          attempt === 0
        )
          continue;
        throw error;
      }
    }
    throw new AppException('CONCURRENT_WRITE', '同时操作较多，请重试', HttpStatus.CONFLICT);
  }

  async update(familyId: string, id: string, input: Partial<PetInput> & { version: number }) {
    await this.assertBirthDate(familyId, input.birthDate);
    const result = await this.prisma.pet.updateMany({
      where: { id, familyId, version: input.version, deletedAt: null },
      data: { ...this.mutableData(input), version: { increment: 1 } },
    });
    if (!result.count) {
      const exists = await this.prisma.pet.count({ where: { id, familyId, deletedAt: null } });
      throw new AppException(
        exists ? 'VERSION_CONFLICT' : 'PET_NOT_FOUND',
        exists ? '猫咪档案已被其他成员修改' : '猫咪档案不存在',
        exists ? HttpStatus.CONFLICT : HttpStatus.NOT_FOUND,
      );
    }
    return this.get(familyId, id);
  }

  async remove(familyId: string, actorUserId: string, id: string, version: number) {
    const deletedAt = new Date();
    await this.prisma.$transaction(
      async (tx) => {
        const pet = await tx.pet.updateMany({
          where: { id, familyId, version, deletedAt: null },
          data: { deletedAt, version: { increment: 1 } },
        });
        if (!pet.count)
          throw new AppException(
            'VERSION_CONFLICT',
            '猫咪档案不存在或已被修改',
            HttpStatus.CONFLICT,
          );

        const plans = await tx.plan.updateMany({
          where: { familyId, petId: id, enabled: true, deletedAt: null },
          data: { enabled: false, version: { increment: 1 } },
        });
        const tasks = await tx.task.updateMany({
          where: { familyId, petId: id, status: 'PENDING', deletedAt: null },
          data: { status: 'CANCELLED', version: { increment: 1 } },
        });
        await tx.auditLog.create({
          data: {
            familyId,
            actorUserId,
            action: 'pet.delete',
            resourceType: 'pet',
            resourceId: id,
            beforeSafe: { deletedAt: null, version },
            afterSafe: {
              deletedAt: deletedAt.toISOString(),
              version: version + 1,
              plansDisabled: plans.count,
              tasksCancelled: tasks.count,
            },
          },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  private createData(
    familyId: string,
    userId: string,
    input: PetInput,
  ): Prisma.PetUncheckedCreateInput {
    return { familyId, createdById: userId, ...this.mutableData(input), name: input.name.trim() };
  }

  private async assertBirthDate(familyId: string, birthDate: string | null | undefined) {
    if (!birthDate) return;
    const family = await this.prisma.family.findUniqueOrThrow({
      where: { id: familyId },
      select: { timezone: true },
    });
    if (!isCalendarDateOnOrBefore(birthDate, new Date(), family.timezone)) {
      throw new AppException(
        'BIRTH_DATE_IN_FUTURE',
        '出生日期不能晚于家庭时区的今天',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }
  }

  private async withAvatar<T extends { avatarKey: string | null }>(familyId: string, pet: T) {
    return {
      ...pet,
      avatarUrl: pet.avatarKey
        ? await this.photos.avatarUrlForObjectKey(familyId, pet.avatarKey)
        : null,
    };
  }

  private mutableData(input: Partial<PetInput>) {
    return {
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.sex !== undefined ? { sex: input.sex } : {}),
      ...(input.birthDate !== undefined
        ? { birthDate: input.birthDate ? new Date(`${input.birthDate}T00:00:00.000Z`) : null }
        : {}),
      ...(input.breed !== undefined ? { breed: input.breed?.trim() || null } : {}),
      ...(input.neutered !== undefined ? { neutered: input.neutered } : {}),
      ...(input.chipNumber !== undefined ? { chipNumber: input.chipNumber?.trim() || null } : {}),
    };
  }

  private readonly selection = {
    id: true,
    familyId: true,
    name: true,
    sex: true,
    birthDate: true,
    breed: true,
    neutered: true,
    chipNumber: true,
    avatarKey: true,
    version: true,
    createdAt: true,
    updatedAt: true,
  } satisfies Prisma.PetSelect;

  private readonly recordSelection = {
    id: true,
    type: true,
    title: true,
    abnormal: true,
    occurredAt: true,
    data: true,
    note: true,
  } satisfies Prisma.RecordSelect;

  private readonly medicalRecordSelection = {
    id: true,
    type: true,
    title: true,
    occurredAt: true,
    brand: true,
    batchNumber: true,
    dose: true,
    provider: true,
    nextDueAt: true,
    reaction: true,
    note: true,
    version: true,
  } satisfies Prisma.MedicalRecordSelect;

  private readonly healthEventSelection = {
    id: true,
    title: true,
    status: true,
    startedAt: true,
    recoveredAt: true,
    summary: true,
    version: true,
  } satisfies Prisma.HealthEventSelect;

  private async medicalCounts(familyId: string, petId: string) {
    const [vaccines, deworming, medications] = await Promise.all([
      this.prisma.medicalRecord.count({
        where: { familyId, petId, type: MedicalRecordType.VACCINE, deletedAt: null },
      }),
      this.prisma.medicalRecord.count({
        where: { familyId, petId, type: MedicalRecordType.DEWORMING, deletedAt: null },
      }),
      this.prisma.medicalRecord.count({
        where: { familyId, petId, type: MedicalRecordType.MEDICATION, deletedAt: null },
      }),
    ]);
    return { vaccines, deworming, medications };
  }
}

function weightKgFromData(data: Prisma.JsonValue) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const value = (data as { weightKg?: unknown }).weightKg;
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function localDateKey(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? '00';
  return `${value('year')}-${value('month')}-${value('day')}`;
}
