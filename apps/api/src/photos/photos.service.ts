import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FamilyRole, PhotoStatus, Prisma, UploadPurpose } from '@prisma/client';
import COS from 'cos-nodejs-sdk-v5';
import type { Request, Response } from 'express';
import { AppException } from '../common/app.exception';
import { PrismaService } from '../prisma/prisma.service';

const MAX_BYTES = 10 * 1024 * 1024;
const mimeExtensions = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/heic': 'heic',
  'image/heif': 'heif',
} as const;
type AllowedMime = keyof typeof mimeExtensions;

interface PresignInput {
  fileName: string;
  mimeType: string;
  byteSize: number;
  purpose: UploadPurpose;
}
interface PhotoInput {
  objectKey: string;
  thumbnailObjectKey: string;
  petIds: string[];
  note?: string;
  checksum?: string;
  thumbnailChecksum?: string;
  width?: number;
  height?: number;
  recordId?: string;
}

export interface RecordPhotoSummaryInput {
  id: string;
  objectKey: string;
  thumbnailObjectKey?: string | null;
  width?: number | null;
  height?: number | null;
  note?: string | null;
  createdAt?: Date | string;
}

@Injectable()
export class PhotosService {
  private readonly localDirectory: string;
  private readonly cos: COS | null;
  private readonly bucket: string | null;
  private readonly region: string | null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    this.localDirectory = resolve(
      process.cwd(),
      this.config.get('UPLOAD_LOCAL_DIR') ?? '../../output/uploads',
    );
    this.bucket = this.config.get('COS_BUCKET') ?? null;
    this.region = this.config.get('COS_REGION') ?? null;
    const secretId = this.config.get<string>('COS_SECRET_ID');
    const secretKey = this.config.get<string>('COS_SECRET_KEY');
    this.cos =
      this.bucket && this.region && secretId && secretKey
        ? new COS({ SecretId: secretId, SecretKey: secretKey })
        : null;
  }

  async presign(familyId: string, userId: string, input: PresignInput) {
    const mimeType = input.mimeType.toLowerCase() as AllowedMime;
    if (!(mimeType in mimeExtensions))
      throw new AppException(
        'UNSUPPORTED_IMAGE_TYPE',
        '仅支持 JPEG、PNG、HEIC 或 HEIF 图片',
        HttpStatus.UNSUPPORTED_MEDIA_TYPE,
      );
    if (input.byteSize > MAX_BYTES)
      throw new AppException(
        'IMAGE_TOO_LARGE',
        '单张图片不能超过 10MB',
        HttpStatus.PAYLOAD_TOO_LARGE,
      );
    const folder = input.purpose === UploadPurpose.PHOTO_THUMBNAIL ? 'thumbnails' : 'photos';
    const objectKey = `families/${familyId}/${folder}/${randomUUID()}.${mimeExtensions[mimeType]}`;
    const expiresAt = new Date(Date.now() + 10 * 60_000);
    if (this.cos && this.bucket && this.region) {
      await this.prisma.uploadIntent.create({
        data: {
          familyId,
          userId,
          objectKey,
          mimeType,
          byteSize: input.byteSize,
          purpose: input.purpose,
          expiresAt,
        },
      });
      return {
        uploadUrl: this.cos.getObjectUrl({
          Bucket: this.bucket,
          Region: this.region,
          Key: objectKey,
          Method: 'PUT',
          Sign: true,
          Expires: 600,
        }),
        objectKey,
        headers: { 'Content-Type': mimeType },
        expiresAt,
        provider: 'COS' as const,
      };
    }
    if (this.config.get('NODE_ENV') === 'production')
      throw new AppException(
        'COS_NOT_CONFIGURED',
        '图片服务尚未配置',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    const token = randomBytes(32).toString('base64url');
    await this.prisma.uploadIntent.create({
      data: {
        familyId,
        userId,
        objectKey,
        mimeType,
        byteSize: input.byteSize,
        purpose: input.purpose,
        tokenHash: this.hash(token),
        expiresAt,
      },
    });
    const baseUrl =
      this.config.get('PUBLIC_API_URL') ??
      `http://127.0.0.1:${this.config.get('PORT') ?? 3000}/api/v1`;
    return {
      uploadUrl: `${baseUrl}/uploads/local/${token}`,
      objectKey,
      headers: { 'Content-Type': mimeType },
      expiresAt,
      provider: 'LOCAL' as const,
    };
  }

  async receiveLocalUpload(
    token: string,
    contentType: string | undefined,
    contentLength: string | undefined,
    stream: Request,
  ) {
    if (this.config.get('NODE_ENV') === 'production')
      throw new AppException('LOCAL_UPLOAD_DISABLED', '本地上传不可用', HttpStatus.NOT_FOUND);
    const intent = await this.prisma.uploadIntent.findFirst({
      where: { tokenHash: this.hash(token), completedAt: null },
    });
    if (!intent || intent.expiresAt <= new Date())
      throw new AppException(
        'UPLOAD_TOKEN_EXPIRED',
        '上传链接已失效，请重新选择图片',
        HttpStatus.GONE,
      );
    if (contentType?.split(';')[0]?.trim().toLowerCase() !== intent.mimeType)
      throw new AppException(
        'UPLOAD_MIME_MISMATCH',
        '图片类型与上传凭证不一致',
        HttpStatus.UNSUPPORTED_MEDIA_TYPE,
      );
    if (contentLength && Number(contentLength) !== intent.byteSize)
      throw new AppException(
        'UPLOAD_SIZE_MISMATCH',
        '图片大小与上传凭证不一致',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    const chunks: Buffer[] = [];
    let received = 0;
    for await (const chunk of stream) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      received += buffer.length;
      if (received > intent.byteSize || received > MAX_BYTES)
        throw new AppException(
          'IMAGE_TOO_LARGE',
          '上传内容超过允许大小',
          HttpStatus.PAYLOAD_TOO_LARGE,
        );
      chunks.push(buffer);
    }
    if (received !== intent.byteSize)
      throw new AppException(
        'UPLOAD_SIZE_MISMATCH',
        '图片数据不完整',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    const body = Buffer.concat(chunks);
    this.assertImageSignature(body, intent.mimeType);
    const path = this.localPath(intent.objectKey);
    await mkdir(join(path, '..'), { recursive: true });
    await writeFile(path, body, { flag: 'wx' }).catch(async (error: NodeJS.ErrnoException) => {
      if (error.code !== 'EEXIST') throw error;
      const existing = await readFile(path);
      if (!existing.equals(body))
        throw new AppException(
          'OBJECT_KEY_REUSED',
          '上传对象已存在且内容不同',
          HttpStatus.CONFLICT,
        );
    });
    return { checksum: createHash('sha256').update(body).digest('hex'), byteSize: received };
  }

  async create(familyId: string, userId: string, input: PhotoInput) {
    const existing = await this.prisma.photo.findFirst({
      where: { objectKey: input.objectKey, familyId },
      select: this.selection,
    });
    if (existing) return this.withUrl(existing);
    const intent = await this.prisma.uploadIntent.findFirst({
      where: {
        objectKey: input.objectKey,
        familyId,
        userId,
        purpose: UploadPurpose.PHOTO,
        completedAt: null,
      },
    });
    if (!intent || intent.expiresAt <= new Date())
      throw new AppException('UPLOAD_INTENT_INVALID', '上传凭证无效或已过期', HttpStatus.GONE);
    const thumbnailIntent = await this.prisma.uploadIntent.findFirst({
      where: {
        objectKey: input.thumbnailObjectKey,
        familyId,
        userId,
        purpose: UploadPurpose.PHOTO_THUMBNAIL,
        completedAt: null,
      },
    });
    if (!thumbnailIntent || thumbnailIntent.expiresAt <= new Date())
      throw new AppException(
        'THUMBNAIL_UPLOAD_INTENT_INVALID',
        '缩略图上传凭证无效或已过期',
        HttpStatus.GONE,
      );
    await this.requirePets(familyId, input.petIds);
    if (
      input.recordId &&
      !(await this.prisma.record.count({
        where: { id: input.recordId, familyId, deletedAt: null },
      }))
    )
      throw new AppException('RECORD_NOT_FOUND', '关联记录不存在', HttpStatus.NOT_FOUND);
    const metadata = await this.verifyObject(intent.objectKey, intent.mimeType, intent.byteSize);
    const thumbnailMetadata = await this.verifyObject(
      thumbnailIntent.objectKey,
      thumbnailIntent.mimeType,
      thumbnailIntent.byteSize,
    );
    if (
      input.checksum &&
      this.normalizeChecksum(input.checksum) !== this.normalizeChecksum(metadata.checksum)
    )
      throw new AppException(
        'CHECKSUM_MISMATCH',
        '图片校验失败，请重新上传',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    if (
      input.thumbnailChecksum &&
      this.normalizeChecksum(input.thumbnailChecksum) !==
        this.normalizeChecksum(thumbnailMetadata.checksum)
    )
      throw new AppException(
        'THUMBNAIL_CHECKSUM_MISMATCH',
        '缩略图校验失败，请重新上传',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    const photo = await this.prisma.$transaction(async (tx) => {
      const created = await tx.photo.create({
        data: {
          familyId,
          createdById: userId,
          objectKey: intent.objectKey,
          thumbnailObjectKey: thumbnailIntent.objectKey,
          mimeType: intent.mimeType,
          byteSize: metadata.byteSize,
          checksum: metadata.checksum,
          thumbnailMimeType: thumbnailIntent.mimeType,
          thumbnailByteSize: thumbnailMetadata.byteSize,
          thumbnailChecksum: thumbnailMetadata.checksum,
          width: input.width,
          height: input.height,
          note: input.note?.trim() || null,
          pets: { create: input.petIds.map((petId) => ({ petId })) },
          ...(input.recordId ? { records: { create: { recordId: input.recordId } } } : {}),
        },
        select: this.selection,
      });
      await tx.uploadIntent.updateMany({
        where: { id: { in: [intent.id, thumbnailIntent.id] } },
        data: { completedAt: new Date() },
      });
      return created;
    });
    return this.withUrl(photo);
  }

  async list(familyId: string, filters: { petId?: string; cursor?: string; limit: number }) {
    const rows = await this.prisma.photo.findMany({
      where: {
        familyId,
        status: PhotoStatus.ACTIVE,
        deletedAt: null,
        ...(filters.petId ? { pets: { some: { petId: filters.petId } } } : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      ...(filters.cursor ? { cursor: { id: filters.cursor }, skip: 1 } : {}),
      take: filters.limit + 1,
      select: this.selection,
    });
    const hasMore = rows.length > filters.limit;
    if (hasMore) rows.pop();
    return {
      items: await Promise.all(rows.map((row) => this.withUrl(row))),
      nextCursor: hasMore ? (rows.at(-1)?.id ?? null) : null,
    };
  }

  async get(familyId: string, id: string) {
    const photo = await this.getRaw(familyId, id);
    return this.withUrl(photo);
  }

  async update(
    familyId: string,
    userId: string,
    role: FamilyRole,
    id: string,
    input: { petIds?: string[]; note?: string | null; version: number },
  ) {
    const current = await this.getRaw(familyId, id);
    this.requireOwnerOrAuthor(
      current.createdById,
      userId,
      role,
      'PHOTO_EDIT_FORBIDDEN',
      '只能编辑自己上传的照片',
    );
    if (input.petIds) await this.requirePets(familyId, input.petIds);
    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.photo.updateMany({
        where: {
          id,
          familyId,
          version: input.version,
          status: PhotoStatus.ACTIVE,
          deletedAt: null,
        },
        data: {
          ...(input.note !== undefined ? { note: input.note?.trim() || null } : {}),
          version: { increment: 1 },
        },
      });
      if (!result.count)
        throw new AppException(
          'VERSION_CONFLICT',
          '照片信息已被其他成员修改',
          HttpStatus.CONFLICT,
          undefined,
          { serverVersion: (await this.getRaw(familyId, id)).version },
        );
      if (input.petIds) {
        await tx.photoPet.deleteMany({ where: { photoId: id } });
        await tx.photoPet.createMany({
          data: input.petIds.map((petId) => ({ photoId: id, petId })),
        });
      }
      return tx.photo.findUniqueOrThrow({ where: { id }, select: this.selection });
    });
    return this.withUrl(updated);
  }

  async remove(familyId: string, userId: string, role: FamilyRole, id: string, version: number) {
    const current = await this.getRaw(familyId, id);
    this.requireOwnerOrAuthor(
      current.createdById,
      userId,
      role,
      'PHOTO_DELETE_FORBIDDEN',
      '只能删除自己上传的照片',
    );
    await this.prisma.$transaction(async (tx) => {
      const result = await tx.photo.updateMany({
        where: { id, familyId, version, status: PhotoStatus.ACTIVE, deletedAt: null },
        data: { status: PhotoStatus.DELETED, deletedAt: new Date(), version: { increment: 1 } },
      });
      if (!result.count)
        throw new AppException('VERSION_CONFLICT', '照片已被修改', HttpStatus.CONFLICT);
      await tx.pet.updateMany({
        where: { familyId, avatarKey: current.objectKey },
        data: { avatarKey: null, version: { increment: 1 } },
      });
      await tx.auditLog.create({
        data: {
          familyId,
          actorUserId: userId,
          action: 'photo.delete',
          resourceType: 'photo',
          resourceId: id,
          beforeSafe: {
            objectKey: current.objectKey,
            petIds: current.pets.map((item) => item.petId),
          },
        },
      });
    });
  }

  async setAvatar(familyId: string, userId: string, photoId: string, petId: string) {
    const photo = await this.getRaw(familyId, photoId);
    if (!photo.pets.some((entry) => entry.petId === petId))
      throw new AppException(
        'PHOTO_PET_MISMATCH',
        '照片尚未绑定这只猫咪',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    const pet = await this.prisma.pet.findFirst({
      where: { id: petId, familyId, deletedAt: null },
    });
    if (!pet) throw new AppException('PET_NOT_FOUND', '猫咪档案不存在', HttpStatus.NOT_FOUND);
    await this.prisma.$transaction([
      this.prisma.pet.update({
        where: { id: petId },
        data: { avatarKey: photo.objectKey, version: { increment: 1 } },
      }),
      this.prisma.auditLog.create({
        data: {
          familyId,
          actorUserId: userId,
          action: 'pet.avatar.set',
          resourceType: 'pet',
          resourceId: petId,
          beforeSafe: { avatarKey: pet.avatarKey },
          afterSafe: { photoId },
        },
      }),
    ]);
    return { petId, photoId, avatarUrl: await this.objectUrl(photo.id, photo.objectKey, false) };
  }

  async avatarUrlForObjectKey(familyId: string, objectKey: string) {
    const photo = await this.prisma.photo.findFirst({
      where: { familyId, objectKey, status: PhotoStatus.ACTIVE, deletedAt: null },
      select: { id: true, objectKey: true, thumbnailObjectKey: true },
    });
    if (!photo) return null;
    return this.objectUrl(
      photo.id,
      photo.thumbnailObjectKey ?? photo.objectKey,
      !!photo.thumbnailObjectKey,
    );
  }

  async pipeLocalContent(familyId: string, id: string, response: Response, thumbnail = false) {
    if (this.cos)
      throw new AppException('CONTENT_REDIRECT_REQUIRED', '请使用照片签名地址', HttpStatus.GONE);
    const photo = await this.getRaw(familyId, id);
    const objectKey =
      thumbnail && photo.thumbnailObjectKey ? photo.thumbnailObjectKey : photo.objectKey;
    const mimeType =
      thumbnail && photo.thumbnailMimeType ? photo.thumbnailMimeType : photo.mimeType;
    const byteSize =
      thumbnail && photo.thumbnailByteSize ? photo.thumbnailByteSize : photo.byteSize;
    const path = this.localPath(objectKey);
    await stat(path).catch(() => {
      throw new AppException('PHOTO_CONTENT_NOT_FOUND', '图片文件不存在', HttpStatus.NOT_FOUND);
    });
    response.setHeader('Content-Type', mimeType);
    response.setHeader('Content-Length', byteSize);
    response.setHeader('Cache-Control', 'private, max-age=3600');
    createReadStream(path).pipe(response);
  }

  private async verifyObject(objectKey: string, mimeType: string, byteSize: number) {
    if (this.cos && this.bucket && this.region) {
      const head = await this.cos
        .headObject({ Bucket: this.bucket, Region: this.region, Key: objectKey })
        .catch(() => {
          throw new AppException(
            'UPLOADED_OBJECT_NOT_FOUND',
            '未找到已上传图片',
            HttpStatus.UNPROCESSABLE_ENTITY,
          );
        });
      const headers = head.headers as Record<string, string | undefined>;
      const actualSize = Number(headers['content-length']);
      const actualMime = headers['content-type']?.split(';')[0]?.toLowerCase();
      if (actualSize !== byteSize || actualMime !== mimeType)
        throw new AppException(
          'UPLOADED_OBJECT_MISMATCH',
          '图片大小或类型与凭证不一致',
          HttpStatus.UNPROCESSABLE_ENTITY,
        );
      const sample = await this.cos
        .getObject({
          Bucket: this.bucket,
          Region: this.region,
          Key: objectKey,
          Range: 'bytes=0-31',
        })
        .catch(() => {
          throw new AppException(
            'UPLOADED_OBJECT_NOT_FOUND',
            '无法读取已上传图片',
            HttpStatus.UNPROCESSABLE_ENTITY,
          );
        });
      this.assertImageSignature(
        Buffer.isBuffer(sample.Body) ? sample.Body : Buffer.from(sample.Body as string),
        mimeType,
      );
      return { byteSize: actualSize, checksum: this.normalizeChecksum(head.ETag) };
    }
    const path = this.localPath(objectKey);
    const info = await stat(path).catch(() => {
      throw new AppException(
        'UPLOADED_OBJECT_NOT_FOUND',
        '未找到已上传图片',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    });
    if (info.size !== byteSize)
      throw new AppException(
        'UPLOADED_OBJECT_MISMATCH',
        '图片大小与凭证不一致',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    const body = await readFile(path);
    this.assertImageSignature(body, mimeType);
    return { byteSize: info.size, checksum: createHash('sha256').update(body).digest('hex') };
  }

  private async requirePets(familyId: string, petIds: string[]) {
    const count = await this.prisma.pet.count({
      where: { familyId, id: { in: petIds }, deletedAt: null },
    });
    if (count !== petIds.length)
      throw new AppException('PET_NOT_FOUND', '部分猫咪档案不存在', HttpStatus.NOT_FOUND);
  }

  private async getRaw(familyId: string, id: string) {
    const photo = await this.prisma.photo.findFirst({
      where: { id, familyId, status: PhotoStatus.ACTIVE, deletedAt: null },
      select: this.selection,
    });
    if (!photo) throw new AppException('PHOTO_NOT_FOUND', '照片不存在', HttpStatus.NOT_FOUND);
    return photo;
  }

  private requireOwnerOrAuthor(
    authorId: string,
    userId: string,
    role: FamilyRole,
    code: string,
    message: string,
  ) {
    if (role === FamilyRole.MEMBER && authorId !== userId)
      throw new AppException(code, message, HttpStatus.FORBIDDEN);
  }

  private async withUrl<
    T extends { id: string; objectKey: string; thumbnailObjectKey?: string | null },
  >(photo: T) {
    return {
      ...photo,
      downloadUrl: await this.objectUrl(photo.id, photo.objectKey, false),
      thumbnailUrl: await this.objectUrl(
        photo.id,
        photo.thumbnailObjectKey ?? photo.objectKey,
        !!photo.thumbnailObjectKey,
      ),
    };
  }

  async recordSummary(photo: RecordPhotoSummaryInput) {
    const withUrls = await this.withUrl(photo);
    return {
      id: withUrls.id,
      width: withUrls.width ?? null,
      height: withUrls.height ?? null,
      note: withUrls.note ?? null,
      createdAt: withUrls.createdAt,
      downloadUrl: withUrls.downloadUrl,
      thumbnailUrl: withUrls.thumbnailUrl,
    };
  }

  private async objectUrl(photoId: string, objectKey: string, thumbnail: boolean) {
    if (this.cos && this.bucket && this.region)
      return this.cos.getObjectUrl({
        Bucket: this.bucket,
        Region: this.region,
        Key: objectKey,
        Method: 'GET',
        Sign: true,
        Expires: 3600,
      });
    return `/photos/${photoId}/${thumbnail ? 'thumbnail' : 'content'}`;
  }
  private localPath(objectKey: string) {
    return join(this.localDirectory, ...objectKey.split('/'));
  }
  private hash(value: string) {
    return createHash('sha256').update(value).digest('hex');
  }
  private normalizeChecksum(value: string) {
    return value.trim().replace(/^W\//, '').replace(/^"|"$/g, '').toLowerCase();
  }
  private assertImageSignature(body: Buffer, mimeType: string) {
    const isJpeg = body.length >= 3 && body[0] === 0xff && body[1] === 0xd8 && body[2] === 0xff;
    const isPng =
      body.length >= 8 &&
      body.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    const brand =
      body.length >= 12 && body.subarray(4, 8).toString('ascii') === 'ftyp'
        ? body.subarray(8, 12).toString('ascii')
        : '';
    const isHeif = ['heic', 'heix', 'hevc', 'hevx', 'mif1', 'msf1'].includes(brand);
    const valid = mimeType === 'image/jpeg' ? isJpeg : mimeType === 'image/png' ? isPng : isHeif;
    if (!valid)
      throw new AppException(
        'IMAGE_SIGNATURE_MISMATCH',
        '文件内容与声明的图片类型不一致',
        HttpStatus.UNSUPPORTED_MEDIA_TYPE,
      );
  }

  private readonly selection = {
    id: true,
    familyId: true,
    createdById: true,
    objectKey: true,
    thumbnailObjectKey: true,
    mimeType: true,
    byteSize: true,
    checksum: true,
    thumbnailMimeType: true,
    thumbnailByteSize: true,
    thumbnailChecksum: true,
    width: true,
    height: true,
    note: true,
    status: true,
    version: true,
    createdAt: true,
    updatedAt: true,
    pets: { select: { petId: true, pet: { select: { id: true, name: true } } } },
    records: { select: { recordId: true } },
    createdBy: { select: { id: true, displayName: true } },
  } satisfies Prisma.PhotoSelect;
}
