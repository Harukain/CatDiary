import { Injectable } from '@nestjs/common';
import type { Plan, Prisma } from '@prisma/client';
import {
  generateOccurrences,
  TASK_GENERATION_WINDOW_DAYS,
  type RecurrenceRule,
} from '@cat-diary/domain';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TaskGenerationService {
  constructor(private readonly prisma: PrismaService) {}

  async generateForPlan(plan: Plan, tx: Prisma.TransactionClient = this.prisma, now = new Date()) {
    if (!plan.enabled || plan.deletedAt) return 0;
    const to = new Date(now.getTime() + TASK_GENERATION_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    const occurrences = generateOccurrences({
      startAt: plan.startAt,
      endAt: plan.endAt,
      timezone: plan.timezone,
      localTime: plan.localTime,
      rule: plan.recurrenceRule as unknown as RecurrenceRule,
      from: now,
      to,
    });
    if (!occurrences.length) return 0;
    const result = await tx.task.createMany({
      data: occurrences.map((scheduledAt) => ({
        familyId: plan.familyId,
        petId: plan.petId,
        planId: plan.id,
        createdById: plan.createdById,
        assigneeId: plan.assigneeId,
        title: plan.title,
        detail: plan.detail,
        type: plan.recordType,
        scheduledAt,
      })),
      skipDuplicates: true,
    });
    return result.count;
  }
}
