import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { HealthEventRelationType, HealthEventStatus } from '@prisma/client';
import { z } from 'zod';
import { AccessTokenGuard } from '../auth/access-token.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AccessTokenPayload } from '../auth/auth.types';
import { IdempotencyService } from '../common/idempotency.service';
import { parseWith } from '../common/zod-parse';
import { CurrentFamily } from '../families/current-family.decorator';
import { FamilyContextGuard } from '../families/family-context.guard';
import type { FamilyContext } from '../families/family-context.types';
import { RoleGuard } from '../families/role.guard';
import { HealthEventsService } from './health-events.service';

const id = z.string().uuid();
const version = z.number().int().positive();
const createSchema = z.object({
  petId: id,
  title: z.string().trim().min(1).max(100),
  startedAt: z.string().datetime(),
  summary: z.string().max(1000).optional(),
  recordIds: z.array(id).max(50).default([]),
});
const updateSchema = z.object({
  title: z.string().trim().min(1).max(100).optional(),
  startedAt: z.string().datetime().optional(),
  summary: z.string().max(1000).optional(),
  version,
});

@ApiTags('health-events')
@ApiBearerAuth()
@UseGuards(AccessTokenGuard, FamilyContextGuard, RoleGuard)
@Controller('health-events')
export class HealthEventsController {
  constructor(
    private readonly events: HealthEventsService,
    private readonly idempotency: IdempotencyService,
  ) {}
  @Get() list(
    @CurrentFamily() family: FamilyContext,
    @Query('petId') petId?: string,
    @Query('status') status?: string,
  ) {
    return this.events.list(family.familyId, {
      ...(petId ? { petId: parseWith(id, petId) } : {}),
      ...(status ? { status: parseWith(z.nativeEnum(HealthEventStatus), status) } : {}),
    });
  }
  @Post() create(
    @CurrentFamily() family: FamilyContext,
    @CurrentUser() user: AccessTokenPayload,
    @Body() body: unknown,
    @Headers('idempotency-key') key?: string,
  ) {
    const input = parseWith(createSchema, body);
    return this.idempotency.execute(user.sub, 'POST /health-events', key, input, () =>
      this.events.create(family.familyId, user.sub, input),
    );
  }
  @Get(':id') get(@CurrentFamily() family: FamilyContext, @Param('id') eventId: string) {
    return this.events.get(family.familyId, parseWith(id, eventId));
  }
  @Patch(':id') update(
    @CurrentFamily() family: FamilyContext,
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') eventId: string,
    @Body() body: unknown,
  ) {
    return this.events.update(
      family.familyId,
      user.sub,
      family.role,
      parseWith(id, eventId),
      parseWith(updateSchema, body),
    );
  }
  @Post(':id/records') addRecord(
    @CurrentFamily() family: FamilyContext,
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') eventId: string,
    @Body() body: unknown,
  ) {
    const input = parseWith(
      z.object({
        recordId: id,
        relationType: z
          .nativeEnum(HealthEventRelationType)
          .default(HealthEventRelationType.OBSERVATION),
      }),
      body,
    );
    return this.events.addRecord(
      family.familyId,
      user.sub,
      family.role,
      parseWith(id, eventId),
      input.recordId,
      input.relationType,
    );
  }
  @Delete(':id/records/:recordId') removeRecord(
    @CurrentFamily() family: FamilyContext,
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') eventId: string,
    @Param('recordId') recordId: string,
  ) {
    return this.events.removeRecord(
      family.familyId,
      user.sub,
      family.role,
      parseWith(id, eventId),
      parseWith(id, recordId),
    );
  }
  @Post(':id/recover') recover(
    @CurrentFamily() family: FamilyContext,
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') eventId: string,
    @Body() body: unknown,
  ) {
    return this.events.recover(
      family.familyId,
      user.sub,
      family.role,
      parseWith(id, eventId),
      parseWith(z.object({ recoveredAt: z.string().datetime(), version }), body),
    );
  }
}
