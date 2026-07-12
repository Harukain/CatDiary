import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { FamilyRole, MedicalRecordType } from '@prisma/client';
import type { Request, Response } from 'express';
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
import { MedicalRecordsService } from './medical-records.service';
import { MedicalSummaryPdfService } from './medical-summary-pdf.service';
const id = z.string().uuid();
const version = z.number().int().positive();
const fields = {
  petId: id,
  type: z.nativeEnum(MedicalRecordType),
  title: z.string().trim().min(1).max(120),
  occurredAt: z.string().datetime(),
  brand: z.string().max(100).optional(),
  batchNumber: z.string().max(100).optional(),
  dose: z.string().max(80).optional(),
  provider: z.string().max(120).optional(),
  nextDueAt: z.string().datetime().nullable().optional(),
  reaction: z.string().max(500).optional(),
  note: z.string().max(1000).optional(),
};
@ApiTags('medical-records')
@ApiBearerAuth()
@UseGuards(AccessTokenGuard, FamilyContextGuard, RoleGuard)
@Controller()
export class MedicalRecordsController {
  constructor(
    private readonly records: MedicalRecordsService,
    private readonly pdf: MedicalSummaryPdfService,
  ) {}
  @Get('medical-records') list(
    @CurrentFamily() family: FamilyContext,
    @Query() query: Record<string, string | undefined>,
  ) {
    return this.records.list(
      family.familyId,
      parseWith(
        z.object({
          petId: id.optional(),
          type: z.nativeEnum(MedicalRecordType).optional(),
          from: z.string().datetime().optional(),
          to: z.string().datetime().optional(),
        }),
        query,
      ),
    );
  }
  @Post('medical-records') @FamilyRoles(FamilyRole.OWNER, FamilyRole.ADMIN) create(
    @CurrentFamily() family: FamilyContext,
    @CurrentUser() user: AccessTokenPayload,
    @Body() body: unknown,
  ) {
    return this.records.create(family.familyId, user.sub, parseWith(z.object(fields), body));
  }
  @Get('medical-records/:id') get(
    @CurrentFamily() family: FamilyContext,
    @Param('id') recordId: string,
  ) {
    return this.records.get(family.familyId, parseWith(id, recordId));
  }
  @Patch('medical-records/:id') @FamilyRoles(FamilyRole.OWNER, FamilyRole.ADMIN) update(
    @CurrentFamily() family: FamilyContext,
    @Param('id') recordId: string,
    @Body() body: unknown,
  ) {
    return this.records.update(
      family.familyId,
      parseWith(id, recordId),
      parseWith(z.object(fields).partial().extend({ version }), body),
    );
  }
  @Delete('medical-records/:id') @FamilyRoles(FamilyRole.OWNER, FamilyRole.ADMIN) remove(
    @CurrentFamily() family: FamilyContext,
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') recordId: string,
    @Body() body: unknown,
  ) {
    return this.records.remove(
      family.familyId,
      user.sub,
      parseWith(id, recordId),
      parseWith(z.object({ version }), body).version,
    );
  }
  @Get('medical-summary') async summary(
    @CurrentFamily() family: FamilyContext,
    @Query('petId') petId: string,
    @Query('from') from: string | undefined,
    @Query('to') to: string | undefined,
    @Query('format') format: string | undefined,
    @Req() request: Request & { requestId?: string },
    @Res() response: Response,
  ) {
    const input = parseWith(
      z.object({
        petId: id,
        from: z.string().datetime().optional(),
        to: z.string().datetime().optional(),
        format: z.enum(['json', 'html', 'pdf']).default('json'),
      }),
      { petId, from, to, format },
    );
    const summary = await this.records.summary(family.familyId, input.petId, input.from, input.to);
    if (input.format === 'html')
      return response.type('text/html; charset=utf-8').send(this.records.toHtml(summary));
    if (input.format === 'pdf') {
      const buffer = await this.pdf.render(summary);
      return response
        .type('application/pdf')
        .attachment(`${summary.pet.name}-medical-summary.pdf`)
        .send(buffer);
    }
    return response.json({ data: summary, meta: { requestId: request.requestId ?? 'unknown' } });
  }
}
