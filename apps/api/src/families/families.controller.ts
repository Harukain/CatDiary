import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { AccessTokenGuard } from '../auth/access-token.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AccessTokenPayload } from '../auth/auth.types';
import { parseWith } from '../common/zod-parse';
import { FamiliesService } from './families.service';

const familyIdSchema = z.string().uuid();
const createFamilySchema = z.object({
  name: z.string().trim().min(1).max(40),
  timezone: z.string().min(1).max(100).default('Asia/Shanghai'),
});
const updateFamilySchema = z
  .object({
    name: z.string().trim().min(1).max(40).optional(),
    timezone: z.string().min(1).max(100).optional(),
    version: z.number().int().positive(),
  })
  .refine((value) => value.name !== undefined || value.timezone !== undefined, {
    message: '至少修改一个字段',
  });

@ApiTags('families')
@ApiBearerAuth()
@UseGuards(AccessTokenGuard)
@Controller('families')
export class FamiliesController {
  constructor(private readonly families: FamiliesService) {}

  @Get()
  list(@CurrentUser() user: AccessTokenPayload) {
    return this.families.list(user.sub);
  }

  @Post()
  create(@CurrentUser() user: AccessTokenPayload, @Body() body: unknown) {
    const input = parseWith(createFamilySchema, body);
    return this.families.create(user.sub, input.name, input.timezone);
  }

  @Get(':id')
  get(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) {
    return this.families.get(user.sub, parseWith(familyIdSchema, id));
  }

  @Patch(':id')
  update(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string, @Body() body: unknown) {
    return this.families.update(
      user.sub,
      parseWith(familyIdSchema, id),
      parseWith(updateFamilySchema, body),
    );
  }
}
