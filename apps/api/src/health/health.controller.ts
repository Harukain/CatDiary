import { Controller, Get, HttpStatus, OnModuleDestroy } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { redisConnectionFromUrl } from '@cat-diary/domain';
import { SkipThrottle } from '@nestjs/throttler';
import { PrismaService } from '../prisma/prisma.service';
import { AppException } from '../common/app.exception';

@ApiTags('health')
@Controller('health')
@SkipThrottle()
export class HealthController implements OnModuleDestroy {
  private readonly queue: Queue;
  private readonly features: { notifications: boolean; exports: boolean };
  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    const connection = redisConnectionFromUrl(config.get('REDIS_URL', 'redis://localhost:6379'));
    this.features = {
      notifications: config.get<boolean>('FEATURE_NOTIFICATIONS_ENABLED', true),
      exports: config.get<boolean>('FEATURE_EXPORTS_ENABLED', true),
    };
    this.queue = new Queue('cat-diary-health', {
      connection,
    });
  }
  async onModuleDestroy() {
    await this.queue.close();
  }

  @Get()
  @ApiOperation({ summary: 'API 进程存活检查' })
  liveness() {
    return {
      status: 'ok',
      service: 'cat-diary-api',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('live')
  @ApiOperation({ summary: 'API 进程存活检查' })
  live() {
    return this.liveness();
  }

  @Get('ready')
  @ApiOperation({ summary: '数据库和 Redis 就绪检查' })
  async readiness() {
    const startedAt = Date.now();
    try {
      await Promise.all([this.prisma.$queryRaw`SELECT 1`, this.queue.getJobCounts('waiting')]);
      return {
        status: 'ready',
        service: 'cat-diary-api',
        dependencies: { postgres: 'ok', redis: 'ok' },
        features: this.features,
        latencyMs: Date.now() - startedAt,
        timestamp: new Date().toISOString(),
      };
    } catch {
      throw new AppException(
        'SERVICE_NOT_READY',
        '服务依赖尚未就绪',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }
}
