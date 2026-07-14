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
import { FamilyRole } from '@prisma/client';
import { z } from 'zod';
import { isValidCalendarDate } from '@cat-diary/domain';
import { petNameSchema } from '@cat-diary/validation';
import { AccessTokenGuard } from '../auth/access-token.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AccessTokenPayload } from '../auth/auth.types';
import { parseWith } from '../common/zod-parse';
import { CurrentFamily } from '../families/current-family.decorator';
import type { FamilyContext } from '../families/family-context.types';
import { FamilyContextGuard } from '../families/family-context.guard';
import { RoleGuard } from '../families/role.guard';
import { FamilyRoles } from '../families/roles.decorator';
import { PetsService } from './pets.service';

const idSchema = z.string().uuid();
const birthDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(isValidCalendarDate, '请输入真实的出生日期');
const petFields = {
  name: petNameSchema,
  sex: z.enum(['MALE', 'FEMALE', 'UNKNOWN']).optional(),
  birthDate: birthDateSchema.nullable().optional(),
  breed: z.string().trim().max(60).nullable().optional(),
  neutered: z.boolean().nullable().optional(),
  chipNumber: z.string().trim().max(50).nullable().optional(),
};
const createPetSchema = z.object(petFields);
const updatePetSchema = z
  .object({ ...petFields, name: petNameSchema.optional(), version: z.number().int().positive() })
  .refine((value) => Object.keys(value).some((key) => key !== 'version'), '至少修改一个字段');
const trendQuerySchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  bucket: z.enum(['day', 'raw']).default('day'),
});

@ApiTags('pets')
@ApiBearerAuth()
@UseGuards(AccessTokenGuard, FamilyContextGuard, RoleGuard)
@Controller('pets')
export class PetsController {
  constructor(private readonly pets: PetsService) {}

  @Get()
  list(@CurrentFamily() family: FamilyContext) {
    return this.pets.list(family.familyId);
  }

  @Get(':id')
  get(@CurrentFamily() family: FamilyContext, @Param('id') id: string) {
    return this.pets.get(family.familyId, parseWith(idSchema, id));
  }

  @Get(':id/profile-summary')
  profileSummary(@CurrentFamily() family: FamilyContext, @Param('id') id: string) {
    return this.pets.profileSummary(family.familyId, parseWith(idSchema, id));
  }

  @Get(':id/weight-trend')
  weightTrend(
    @CurrentFamily() family: FamilyContext,
    @Param('id') id: string,
    @Query() query: Record<string, string | undefined>,
  ) {
    return this.pets.weightTrend(
      family.familyId,
      parseWith(idSchema, id),
      parseWith(trendQuerySchema, query),
    );
  }

  @Post()
  @FamilyRoles(FamilyRole.OWNER, FamilyRole.ADMIN)
  create(
    @CurrentFamily() family: FamilyContext,
    @CurrentUser() user: AccessTokenPayload,
    @Body() body: unknown,
  ) {
    return this.pets.create(family.familyId, user.sub, parseWith(createPetSchema, body));
  }

  @Patch(':id')
  @FamilyRoles(FamilyRole.OWNER, FamilyRole.ADMIN)
  update(@CurrentFamily() family: FamilyContext, @Param('id') id: string, @Body() body: unknown) {
    return this.pets.update(
      family.familyId,
      parseWith(idSchema, id),
      parseWith(updatePetSchema, body),
    );
  }

  @Delete(':id')
  @HttpCode(204)
  @FamilyRoles(FamilyRole.OWNER, FamilyRole.ADMIN)
  remove(
    @CurrentFamily() family: FamilyContext,
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Headers('if-match') versionHeader?: string,
  ) {
    const version = parseWith(z.coerce.number().int().positive(), versionHeader);
    return this.pets.remove(family.familyId, user.sub, parseWith(idSchema, id), version);
  }
}
