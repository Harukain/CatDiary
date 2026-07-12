import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma, RecordType } from '@prisma/client';
import type { RecurrenceRule } from '@cat-diary/domain';
import { AppException } from '../common/app.exception';
import { PrismaService } from '../prisma/prisma.service';
import { TaskGenerationService } from './task-generation.service';

interface PlanInput {
  petId?: string | null;
  type: RecordType;
  title: string;
  detail?: string | null;
  assigneeId?: string | null;
  timezone: string;
  startAt: string;
  endAt?: string | null;
  localTime: string;
  recurrenceRule: RecurrenceRule;
}

@Injectable()
export class PlansService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly generator: TaskGenerationService,
  ) {}

  list(familyId: string, filters: { petId?: string; type?: RecordType; enabled?: boolean }) {
    return this.prisma.plan.findMany({
      where: {
        familyId,
        deletedAt: null,
        ...(filters.petId ? { petId: filters.petId } : {}),
        ...(filters.type ? { recordType: filters.type } : {}),
        ...(filters.enabled !== undefined ? { enabled: filters.enabled } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async get(familyId: string, id: string) {
    const plan = await this.prisma.plan.findFirst({ where: { id, familyId, deletedAt: null } });
    if (!plan) throw new AppException('PLAN_NOT_FOUND', '照顾计划不存在', HttpStatus.NOT_FOUND);
    return plan;
  }

  async create(familyId: string, userId: string, input: PlanInput) {
    await this.validateRelations(familyId, input);
    return this.prisma.$transaction(
      async (tx) => {
        const plan = await tx.plan.create({ data: this.createData(familyId, userId, input) });
        const generatedTaskCount = await this.generator.generateForPlan(plan, tx);
        return { ...plan, generatedTaskCount };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async update(
    familyId: string,
    id: string,
    input: Partial<PlanInput> & { version: number; futureTaskPolicy: 'keep' | 'regenerate' },
  ) {
    const current = await this.get(familyId, id);
    await this.validateRelations(familyId, { ...this.toInput(current), ...input });
    return this.prisma.$transaction(
      async (tx) => {
        const updated = await tx.plan.updateMany({
          where: { id, familyId, version: input.version, deletedAt: null },
          data: { ...this.mutableData(input), version: { increment: 1 } },
        });
        if (!updated.count)
          throw new AppException('VERSION_CONFLICT', '计划已被其他成员修改', HttpStatus.CONFLICT);
        const plan = await tx.plan.findUniqueOrThrow({ where: { id } });
        let generatedTaskCount = 0;
        if (input.futureTaskPolicy === 'regenerate') {
          await tx.task.deleteMany({
            where: { planId: id, status: 'PENDING', scheduledAt: { gt: new Date() } },
          });
          generatedTaskCount = await this.generator.generateForPlan(plan, tx);
        }
        return { ...plan, generatedTaskCount };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async setEnabled(familyId: string, id: string, enabled: boolean, version: number) {
    const result = await this.prisma.plan.updateMany({
      where: { id, familyId, version, deletedAt: null },
      data: { enabled, version: { increment: 1 } },
    });
    if (!result.count)
      throw new AppException('VERSION_CONFLICT', '计划不存在或已被修改', HttpStatus.CONFLICT);
    if (!enabled) {
      await this.prisma.task.updateMany({
        where: { planId: id, status: 'PENDING', scheduledAt: { gt: new Date() } },
        data: { status: 'CANCELLED', version: { increment: 1 } },
      });
    } else {
      await this.prisma.task.updateMany({
        where: { planId: id, status: 'CANCELLED', scheduledAt: { gt: new Date() } },
        data: { status: 'PENDING', version: { increment: 1 } },
      });
    }
    const plan = await this.get(familyId, id);
    if (enabled) await this.generator.generateForPlan(plan);
    return plan;
  }

  async remove(familyId: string, id: string, version: number) {
    await this.prisma.$transaction(async (tx) => {
      const result = await tx.plan.updateMany({
        where: { id, familyId, version, deletedAt: null },
        data: { deletedAt: new Date(), enabled: false, version: { increment: 1 } },
      });
      if (!result.count)
        throw new AppException('VERSION_CONFLICT', '计划不存在或已被修改', HttpStatus.CONFLICT);
      await tx.task.updateMany({
        where: { planId: id, status: 'PENDING' },
        data: { status: 'CANCELLED', version: { increment: 1 } },
      });
    });
  }

  private async validateRelations(familyId: string, input: PlanInput) {
    if (!input.petId && input.type !== RecordType.LITTER)
      throw new AppException('PET_REQUIRED', '该计划必须选择猫咪', HttpStatus.UNPROCESSABLE_ENTITY);
    if (input.petId) {
      const pet = await this.prisma.pet.count({
        where: { id: input.petId, familyId, deletedAt: null },
      });
      if (!pet) throw new AppException('PET_NOT_FOUND', '猫咪档案不存在', HttpStatus.NOT_FOUND);
    }
    if (input.assigneeId) {
      const member = await this.prisma.membership.count({
        where: { familyId, userId: input.assigneeId, status: 'ACTIVE' },
      });
      if (!member)
        throw new AppException(
          'ASSIGNEE_NOT_MEMBER',
          '负责人不是当前家庭成员',
          HttpStatus.UNPROCESSABLE_ENTITY,
        );
    }
  }

  private createData(
    familyId: string,
    userId: string,
    input: PlanInput,
  ): Prisma.PlanUncheckedCreateInput {
    return {
      familyId,
      createdById: userId,
      petId: input.petId,
      assigneeId: input.assigneeId,
      recordType: input.type,
      title: input.title.trim(),
      detail: input.detail?.trim() || null,
      timezone: input.timezone,
      startAt: new Date(input.startAt),
      endAt: input.endAt ? new Date(input.endAt) : null,
      localTime: input.localTime,
      recurrenceRule: input.recurrenceRule as Prisma.InputJsonValue,
    };
  }

  private mutableData(input: Partial<PlanInput>) {
    return {
      ...(input.petId !== undefined ? { petId: input.petId } : {}),
      ...(input.type !== undefined ? { recordType: input.type } : {}),
      ...(input.title !== undefined ? { title: input.title.trim() } : {}),
      ...(input.detail !== undefined ? { detail: input.detail?.trim() || null } : {}),
      ...(input.assigneeId !== undefined ? { assigneeId: input.assigneeId } : {}),
      ...(input.timezone !== undefined ? { timezone: input.timezone } : {}),
      ...(input.startAt !== undefined ? { startAt: new Date(input.startAt) } : {}),
      ...(input.endAt !== undefined ? { endAt: input.endAt ? new Date(input.endAt) : null } : {}),
      ...(input.localTime !== undefined ? { localTime: input.localTime } : {}),
      ...(input.recurrenceRule !== undefined
        ? { recurrenceRule: input.recurrenceRule as Prisma.InputJsonValue }
        : {}),
    };
  }

  private toInput(plan: Awaited<ReturnType<PlansService['get']>>): PlanInput {
    return {
      petId: plan.petId,
      type: plan.recordType,
      title: plan.title,
      detail: plan.detail,
      assigneeId: plan.assigneeId,
      timezone: plan.timezone,
      startAt: plan.startAt.toISOString(),
      endAt: plan.endAt?.toISOString(),
      localTime: plan.localTime,
      recurrenceRule: plan.recurrenceRule as unknown as RecurrenceRule,
    };
  }
}
