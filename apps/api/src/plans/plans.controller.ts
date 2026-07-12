import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { FamilyRole, RecordType } from '@prisma/client';
import { z } from 'zod';
import { AccessTokenGuard } from '../auth/access-token.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AccessTokenPayload } from '../auth/auth.types';
import { parseWith } from '../common/zod-parse';
import { CurrentFamily } from '../families/current-family.decorator';
import { FamilyContextGuard } from '../families/family-context.guard';
import type { FamilyContext } from '../families/family-context.types';
import { RoleGuard } from '../families/role.guard';
import { FamilyRoles } from '../families/roles.decorator';
import { PlansService } from './plans.service';

const idSchema = z.string().uuid();
const recordTypeSchema = z.nativeEnum(RecordType);
const recurrenceSchema = z.discriminatedUnion('frequency', [
  z.object({ frequency: z.literal('once') }),
  z.object({
    frequency: z.literal('daily'),
    interval: z.number().int().min(1).max(365).optional(),
  }),
  z.object({
    frequency: z.literal('weekly'),
    interval: z.number().int().min(1).max(52).optional(),
    weekdays: z.array(z.number().int().min(1).max(7)).min(1),
  }),
  z.object({
    frequency: z.enum(['monthly', 'intervalMonths']),
    interval: z.number().int().min(1).max(24).optional(),
    dayOfMonth: z.number().int().min(1).max(31).optional(),
  }),
]);
const planFields = {
  petId: idSchema.nullable().optional(),
  type: recordTypeSchema,
  title: z.string().trim().min(1).max(80),
  detail: z.string().trim().max(500).nullable().optional(),
  assigneeId: idSchema.nullable().optional(),
  timezone: z.string().min(1).max(100).default('Asia/Shanghai'),
  startAt: z.string().datetime(),
  endAt: z.string().datetime().nullable().optional(),
  localTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  recurrenceRule: recurrenceSchema,
};
const createPlanSchema = z
  .object(planFields)
  .refine((value) => !value.endAt || new Date(value.endAt) >= new Date(value.startAt), {
    message: '结束时间不能早于开始时间',
    path: ['endAt'],
  });
const updatePlanSchema = z
  .object(planFields)
  .partial()
  .extend({
    version: z.number().int().positive(),
    futureTaskPolicy: z.enum(['keep', 'regenerate']),
  });

@ApiTags('plans')
@ApiBearerAuth()
@UseGuards(AccessTokenGuard, FamilyContextGuard, RoleGuard)
@Controller('plans')
export class PlansController {
  constructor(private readonly plans: PlansService) {}

  @Get()
  list(
    @CurrentFamily() family: FamilyContext,
    @Query('petId') petId?: string,
    @Query('type') type?: string,
    @Query('enabled') enabled?: string,
  ) {
    return this.plans.list(family.familyId, {
      ...(petId ? { petId: parseWith(idSchema, petId) } : {}),
      ...(type ? { type: parseWith(recordTypeSchema, type) } : {}),
      ...(enabled !== undefined
        ? { enabled: parseWith(z.enum(['true', 'false']), enabled) === 'true' }
        : {}),
    });
  }

  @Get(':id')
  get(@CurrentFamily() family: FamilyContext, @Param('id') id: string) {
    return this.plans.get(family.familyId, parseWith(idSchema, id));
  }

  @Post()
  @FamilyRoles(FamilyRole.OWNER, FamilyRole.ADMIN)
  create(
    @CurrentFamily() family: FamilyContext,
    @CurrentUser() user: AccessTokenPayload,
    @Body() body: unknown,
  ) {
    return this.plans.create(family.familyId, user.sub, parseWith(createPlanSchema, body));
  }

  @Patch(':id')
  @FamilyRoles(FamilyRole.OWNER, FamilyRole.ADMIN)
  update(@CurrentFamily() family: FamilyContext, @Param('id') id: string, @Body() body: unknown) {
    return this.plans.update(
      family.familyId,
      parseWith(idSchema, id),
      parseWith(updatePlanSchema, body),
    );
  }

  @Post(':id/pause')
  @FamilyRoles(FamilyRole.OWNER, FamilyRole.ADMIN)
  pause(@CurrentFamily() family: FamilyContext, @Param('id') id: string, @Body() body: unknown) {
    return this.plans.setEnabled(
      family.familyId,
      parseWith(idSchema, id),
      false,
      parseWith(z.object({ version: z.number().int().positive() }), body).version,
    );
  }

  @Post(':id/resume')
  @FamilyRoles(FamilyRole.OWNER, FamilyRole.ADMIN)
  resume(@CurrentFamily() family: FamilyContext, @Param('id') id: string, @Body() body: unknown) {
    return this.plans.setEnabled(
      family.familyId,
      parseWith(idSchema, id),
      true,
      parseWith(z.object({ version: z.number().int().positive() }), body).version,
    );
  }

  @Delete(':id')
  @HttpCode(204)
  @FamilyRoles(FamilyRole.OWNER, FamilyRole.ADMIN)
  remove(
    @CurrentFamily() family: FamilyContext,
    @Param('id') id: string,
    @Headers('if-match') version?: string,
  ) {
    return this.plans.remove(
      family.familyId,
      parseWith(idSchema, id),
      parseWith(z.coerce.number().int().positive(), version),
    );
  }
}
