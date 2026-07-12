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
  Put,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { FamilyRole, UploadPurpose } from '@prisma/client';
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
import { PhotosService } from './photos.service';

const id = z.string().uuid();
const petIds = z
  .array(id)
  .min(1)
  .max(5)
  .refine((values) => new Set(values).size === values.length, '猫咪不能重复');
const presignSchema = z.object({
  fileName: z.string().trim().min(1).max(180),
  mimeType: z.string().trim(),
  byteSize: z
    .number()
    .int()
    .positive()
    .max(10 * 1024 * 1024),
  purpose: z.nativeEnum(UploadPurpose).default(UploadPurpose.PHOTO),
});
const createSchema = z.object({
  objectKey: z.string().min(10).max(500),
  thumbnailObjectKey: z.string().min(10).max(500),
  petIds,
  note: z.string().trim().max(500).optional(),
  checksum: z.string().trim().min(8).max(128).optional(),
  thumbnailChecksum: z.string().trim().min(8).max(128).optional(),
  width: z.number().int().positive().max(30_000).optional(),
  height: z.number().int().positive().max(30_000).optional(),
  recordId: id.optional(),
});
const updateSchema = z.object({
  petIds: petIds.optional(),
  note: z.string().trim().max(500).nullable().optional(),
  version: z.number().int().positive(),
});

@ApiTags('uploads')
@Controller('uploads')
export class UploadsController {
  constructor(private readonly photos: PhotosService) {}

  @Post('presign')
  @ApiBearerAuth()
  @UseGuards(AccessTokenGuard, FamilyContextGuard, RoleGuard)
  presign(
    @CurrentFamily() family: FamilyContext,
    @CurrentUser() user: AccessTokenPayload,
    @Body() body: unknown,
  ) {
    return this.photos.presign(family.familyId, user.sub, parseWith(presignSchema, body));
  }

  @Put('local/:token')
  async receiveLocal(
    @Param('token') token: string,
    @Headers('content-type') contentType: string | undefined,
    @Headers('content-length') contentLength: string | undefined,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.photos.receiveLocalUpload(token, contentType, contentLength, request);
    response.setHeader('ETag', result.checksum);
    return result;
  }
}

@ApiTags('photos')
@ApiBearerAuth()
@UseGuards(AccessTokenGuard, FamilyContextGuard, RoleGuard)
@Controller('photos')
export class PhotosController {
  constructor(private readonly photos: PhotosService) {}

  @Post()
  create(
    @CurrentFamily() family: FamilyContext,
    @CurrentUser() user: AccessTokenPayload,
    @Body() body: unknown,
  ) {
    return this.photos.create(family.familyId, user.sub, parseWith(createSchema, body));
  }

  @Get()
  list(@CurrentFamily() family: FamilyContext, @Query() query: Record<string, string | undefined>) {
    const filters = parseWith(
      z.object({
        petId: id.optional(),
        cursor: id.optional(),
        limit: z.coerce.number().int().min(1).max(50).default(30),
      }),
      query,
    );
    return this.photos.list(family.familyId, filters);
  }

  @Get(':id')
  get(@CurrentFamily() family: FamilyContext, @Param('id') photoId: string) {
    return this.photos.get(family.familyId, parseWith(id, photoId));
  }

  @Get(':id/content')
  async content(
    @CurrentFamily() family: FamilyContext,
    @Param('id') photoId: string,
    @Res() response: Response,
  ) {
    await this.photos.pipeLocalContent(family.familyId, parseWith(id, photoId), response);
  }

  @Get(':id/thumbnail')
  async thumbnail(
    @CurrentFamily() family: FamilyContext,
    @Param('id') photoId: string,
    @Res() response: Response,
  ) {
    await this.photos.pipeLocalContent(family.familyId, parseWith(id, photoId), response, true);
  }

  @Patch(':id')
  update(
    @CurrentFamily() family: FamilyContext,
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') photoId: string,
    @Body() body: unknown,
  ) {
    return this.photos.update(
      family.familyId,
      user.sub,
      family.role,
      parseWith(id, photoId),
      parseWith(updateSchema, body),
    );
  }

  @Delete(':id')
  @HttpCode(204)
  remove(
    @CurrentFamily() family: FamilyContext,
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') photoId: string,
    @Headers('if-match') versionHeader?: string,
  ) {
    return this.photos.remove(
      family.familyId,
      user.sub,
      family.role,
      parseWith(id, photoId),
      parseWith(z.coerce.number().int().positive(), versionHeader),
    );
  }

  @Post(':id/set-avatar')
  @FamilyRoles(FamilyRole.OWNER, FamilyRole.ADMIN)
  setAvatar(
    @CurrentFamily() family: FamilyContext,
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') photoId: string,
    @Body() body: unknown,
  ) {
    return this.photos.setAvatar(
      family.familyId,
      user.sub,
      parseWith(id, photoId),
      parseWith(z.object({ petId: id }), body).petId,
    );
  }
}
