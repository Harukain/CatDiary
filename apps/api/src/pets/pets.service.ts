import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
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
}
