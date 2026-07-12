import { Body, Controller, Get, Headers, Param, Post, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ExportFormat, ExportScope } from '@prisma/client';
import type { Response } from 'express';
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
import { ExportsService } from './exports.service';
const id = z.string().uuid();
const createSchema = z.object({
  format: z.nativeEnum(ExportFormat),
  scope: z.nativeEnum(ExportScope).optional(),
});

@ApiTags('exports')
@ApiBearerAuth()
@UseGuards(AccessTokenGuard, FamilyContextGuard, RoleGuard)
@Controller('exports')
export class ExportsController {
  constructor(
    private readonly exports: ExportsService,
    private readonly idempotency: IdempotencyService,
  ) {}
  @Post() create(
    @CurrentFamily() family: FamilyContext,
    @CurrentUser() user: AccessTokenPayload,
    @Body() body: unknown,
    @Headers('idempotency-key') key?: string,
  ) {
    const input = parseWith(createSchema, body);
    return this.idempotency.execute(
      user.sub,
      'POST /exports',
      key,
      { familyId: family.familyId, ...input },
      () => this.exports.create(family.familyId, user.sub, family.role, input.format, input.scope),
    );
  }
  @Get(':id') get(
    @CurrentFamily() family: FamilyContext,
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') exportId: string,
  ) {
    return this.exports.get(family.familyId, user.sub, family.role, parseWith(id, exportId));
  }
  @Get(':id/download') download(
    @CurrentFamily() family: FamilyContext,
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') exportId: string,
  ) {
    return this.exports.download(family.familyId, user.sub, family.role, parseWith(id, exportId));
  }
}

@ApiTags('export downloads')
@Controller('export-downloads')
export class ExportDownloadsController {
  constructor(private readonly exports: ExportsService) {}
  @Get(':token') content(@Param('token') token: string, @Res() response: Response) {
    return this.exports.pipeDownload(parseWith(z.string().min(32).max(100), token), response);
  }
}
