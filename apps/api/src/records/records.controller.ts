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
import { FamilyRole, RecordType } from '@prisma/client';
import { z } from 'zod';
import { AccessTokenGuard } from '../auth/access-token.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AccessTokenPayload } from '../auth/auth.types';
import { IdempotencyService } from '../common/idempotency.service';
import { parseWith } from '../common/zod-parse';
import { CurrentFamily } from '../families/current-family.decorator';
import { FamilyContextGuard } from '../families/family-context.guard';
import type { FamilyContext } from '../families/family-context.types';
import { FamilyRoles } from '../families/roles.decorator';
import { RoleGuard } from '../families/role.guard';
import { parseRecordData } from './record.schemas';
import { RecordsService } from './records.service';

const id = z.string().uuid();
const base = z.object({
  clientId: z.string().uuid(),
  petId: id,
  type: z.nativeEnum(RecordType),
  title: z.string().trim().min(1).max(100),
  occurredAt: z.string().datetime(),
  abnormal: z.boolean().default(false),
  data: z.unknown(),
  note: z.string().max(500).optional(),
});
const patch = z.object({
  petId: id.optional(),
  title: z.string().trim().min(1).max(100).optional(),
  occurredAt: z.string().datetime().optional(),
  abnormal: z.boolean().optional(),
  data: z.unknown().optional(),
  note: z.string().max(500).optional(),
  version: z.number().int().positive(),
});

@ApiTags('records')
@ApiBearerAuth()
@UseGuards(AccessTokenGuard, FamilyContextGuard, RoleGuard)
@Controller('records')
export class RecordsController {
  constructor(
    private readonly records: RecordsService,
    private readonly idempotency: IdempotencyService,
  ) {}

  @Get()
  list(@CurrentFamily() family: FamilyContext, @Query() query: Record<string, string | undefined>) {
    const filters = parseWith(
      z.object({
        petId: id.optional(),
        type: z.nativeEnum(RecordType).optional(),
        from: z.string().datetime().optional(),
        to: z.string().datetime().optional(),
        cursor: id.optional(),
        limit: z.coerce.number().int().min(1).max(100).default(30),
      }),
      query,
    );
    return this.records.list(family.familyId, filters);
  }

  @Post()
  create(
    @CurrentFamily() family: FamilyContext,
    @CurrentUser() user: AccessTokenPayload,
    @Body() body: unknown,
    @Headers('idempotency-key') key?: string,
  ) {
    const input = parseWith(base, body);
    const validated = { ...input, data: parseRecordData(input.type, input.data) };
    return this.idempotency.execute(user.sub, 'POST /records', key, validated, () =>
      this.records.create(family.familyId, user.sub, validated),
    );
  }

  @Get(':id') get(@CurrentFamily() family: FamilyContext, @Param('id') recordId: string) {
    return this.records.get(family.familyId, parseWith(id, recordId));
  }

  @Patch(':id')
  update(
    @CurrentFamily() family: FamilyContext,
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') recordId: string,
    @Body() body: unknown,
  ) {
    const input = parseWith(patch, body);
    return this.records.get(family.familyId, parseWith(id, recordId)).then((current) =>
      this.records.update(family.familyId, user.sub, family.role, current.id, {
        ...input,
        ...(input.data === undefined ? {} : { data: parseRecordData(current.type, input.data) }),
      }),
    );
  }

  @Delete(':id') remove(
    @CurrentFamily() family: FamilyContext,
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') recordId: string,
    @Body() body: unknown,
  ) {
    return this.records.remove(
      family.familyId,
      user.sub,
      family.role,
      parseWith(id, recordId),
      parseWith(z.object({ version: z.number().int().positive() }), body).version,
    );
  }

  @Post(':id/restore')
  @FamilyRoles(FamilyRole.OWNER, FamilyRole.ADMIN)
  restore(
    @CurrentFamily() family: FamilyContext,
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') recordId: string,
  ) {
    return this.records.restore(family.familyId, user.sub, parseWith(id, recordId));
  }
}
