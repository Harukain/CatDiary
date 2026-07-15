import { createHash, randomBytes } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { HttpStatus, Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ExportFormat, ExportScope, ExportStatus, FamilyRole } from '@prisma/client';
import { Queue } from 'bullmq';
import { redisConnectionFromUrl } from '@cat-diary/domain';
import COS from 'cos-nodejs-sdk-v5';
import type { Response } from 'express';
import { AppException } from '../common/app.exception';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ExportsService implements OnModuleDestroy {
  private readonly queue: Queue;
  private readonly directory: string;
  private readonly cos: COS | null;
  private readonly bucket: string | null;
  private readonly region: string | null;
  private readonly enabled: boolean;
  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    const connection = redisConnectionFromUrl(config.get('REDIS_URL', 'redis://localhost:6379'));
    this.enabled = config.get<boolean>('FEATURE_EXPORTS_ENABLED', true);
    this.queue = new Queue('cat-diary-exports', {
      connection,
    });
    this.directory = resolve(
      process.cwd(),
      config.get('EXPORT_LOCAL_DIR') ?? '../../output/exports',
    );
    this.bucket = config.get('COS_BUCKET') ?? null;
    this.region = config.get('COS_REGION') ?? null;
    const secretId = config.get<string>('COS_SECRET_ID');
    const secretKey = config.get<string>('COS_SECRET_KEY');
    this.cos =
      this.bucket && this.region && secretId && secretKey
        ? new COS({ SecretId: secretId, SecretKey: secretKey })
        : null;
  }
  async onModuleDestroy() {
    await this.queue.close();
  }

  async create(
    familyId: string,
    userId: string,
    role: FamilyRole,
    format: ExportFormat,
    requestedScope?: ExportScope,
  ) {
    if (!this.enabled)
      throw new AppException(
        'EXPORTS_TEMPORARILY_DISABLED',
        '数据导出正在维护，请稍后再试',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    const isAdmin = role === FamilyRole.OWNER || role === FamilyRole.ADMIN;
    const scope = requestedScope ?? (isAdmin ? ExportScope.FAMILY : ExportScope.PERSONAL);
    if (scope === ExportScope.FAMILY && !isAdmin)
      throw new AppException(
        'FAMILY_EXPORT_FORBIDDEN',
        '普通成员只能导出自己的数据',
        HttpStatus.FORBIDDEN,
      );
    const job = await this.prisma.exportJob.create({
      data: { familyId, requestedById: userId, format, scope },
      select: this.selection,
    });
    await this.prisma.auditLog.create({
      data: {
        familyId,
        actorUserId: userId,
        action: 'data.export.request',
        resourceType: 'export_job',
        resourceId: job.id,
        afterSafe: { format, scope },
      },
    });
    await this.queue.add(
      'build-export',
      { exportId: job.id },
      {
        jobId: `export-${job.id}`,
        attempts: 3,
        backoff: { type: 'exponential', delay: 10_000 },
        removeOnComplete: { age: 7 * 24 * 60 * 60 },
        removeOnFail: { age: 30 * 24 * 60 * 60 },
      },
    );
    return this.publicJob(job);
  }

  async get(familyId: string, userId: string, role: FamilyRole, id: string) {
    return this.publicJob(await this.getRaw(familyId, userId, role, id));
  }

  private async getRaw(familyId: string, userId: string, role: FamilyRole, id: string) {
    const job = await this.prisma.exportJob.findFirst({
      where: { id, familyId },
      select: this.selection,
    });
    if (!job) throw new AppException('EXPORT_NOT_FOUND', '导出任务不存在', HttpStatus.NOT_FOUND);
    if (job.requestedById !== userId && role === FamilyRole.MEMBER)
      throw new AppException(
        'EXPORT_FORBIDDEN',
        '只能查看自己创建的导出任务',
        HttpStatus.FORBIDDEN,
      );
    return job;
  }

  async download(familyId: string, userId: string, role: FamilyRole, id: string) {
    const job = await this.getRaw(familyId, userId, role, id);
    if (
      job.status !== ExportStatus.READY ||
      !job.objectKey ||
      !job.expiresAt ||
      job.expiresAt <= new Date()
    )
      throw new AppException('EXPORT_NOT_READY', '导出文件尚未生成或已经过期', HttpStatus.GONE);
    const expiresAt = new Date(Date.now() + 10 * 60_000);
    if (this.cos && this.bucket && this.region)
      return {
        downloadUrl: await this.signedObjectUrl({
          Bucket: this.bucket,
          Region: this.region,
          Key: job.objectKey,
          Method: 'GET',
          Sign: true,
          Expires: 600,
        }),
        expiresAt,
      };
    const token = randomBytes(32).toString('base64url');
    await this.prisma.exportJob.update({
      where: { id: job.id },
      data: { downloadTokenHash: this.hash(token), downloadTokenExpiresAt: expiresAt },
    });
    return { downloadUrl: `/export-downloads/${token}`, expiresAt };
  }

  async pipeDownload(token: string, response: Response) {
    const job = await this.prisma.exportJob.findFirst({
      where: {
        downloadTokenHash: this.hash(token),
        downloadTokenExpiresAt: { gt: new Date() },
        status: ExportStatus.READY,
      },
      select: { objectKey: true, mimeType: true, byteSize: true, format: true },
    });
    if (!job?.objectKey)
      throw new AppException('EXPORT_LINK_EXPIRED', '下载链接已失效', HttpStatus.GONE);
    const path = resolve(this.directory, job.objectKey.replace(/^exports\//, ''));
    await stat(path).catch(() => {
      throw new AppException('EXPORT_FILE_NOT_FOUND', '导出文件不存在', HttpStatus.NOT_FOUND);
    });
    response.setHeader(
      'Content-Type',
      job.mimeType ?? (job.format === ExportFormat.JSON ? 'application/json' : 'text/csv'),
    );
    response.setHeader('Content-Length', job.byteSize ?? 0);
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="cat-diary-export.${job.format.toLowerCase()}"`,
    );
    response.setHeader('Cache-Control', 'private, no-store');
    createReadStream(path).pipe(response);
  }
  private hash(value: string) {
    return createHash('sha256').update(value).digest('hex');
  }
  private publicJob<T extends { objectKey: string | null }>(job: T) {
    const { objectKey: _objectKey, ...safe } = job;
    return safe;
  }
  private async signedObjectUrl(params: COS.GetObjectUrlParams) {
    if (!this.cos)
      throw new AppException(
        'COS_NOT_CONFIGURED',
        '文件服务尚未配置',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    const syncUrl = this.cos.getObjectUrl(params);
    if (typeof syncUrl === 'string' && syncUrl) return syncUrl;
    const asyncUrl = await new Promise<string>((resolve, reject) => {
      this.cos!.getObjectUrl(params, (error, data) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(data.Url);
      });
    });
    if (!asyncUrl)
      throw new AppException(
        'EXPORT_SIGN_URL_FAILED',
        '导出文件签名地址生成失败',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    return asyncUrl;
  }
  private readonly selection = {
    id: true,
    familyId: true,
    requestedById: true,
    scope: true,
    format: true,
    status: true,
    objectKey: true,
    byteSize: true,
    errorCode: true,
    completedAt: true,
    expiresAt: true,
    createdAt: true,
    updatedAt: true,
  } as const;
}
