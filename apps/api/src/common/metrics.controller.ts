import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SkipThrottle } from '@nestjs/throttler';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Response } from 'express';
import { timingSafeEqual } from 'node:crypto';
import { AppException } from './app.exception';
import { MetricsService } from './metrics.service';

@Controller('metrics')
@SkipThrottle()
@ApiExcludeController()
export class MetricsController {
  constructor(
    private readonly metrics: MetricsService,
    private readonly config: ConfigService,
  ) {}

  @Get()
  async get(@Res() response: Response) {
    const expected = this.config.get<string>('METRICS_TOKEN');
    const supplied = metricsCredential(
      response.req.header('X-Metrics-Token'),
      response.req.header('Authorization'),
    );
    if (expected && !this.matches(expected, supplied))
      throw new AppException('METRICS_UNAUTHORIZED', '无权读取服务指标', HttpStatus.UNAUTHORIZED);

    response.type(this.metrics.registry.contentType);
    response.send(await this.metrics.registry.metrics());
  }

  private matches(expected: string, supplied?: string) {
    if (!supplied) return false;
    const left = Buffer.from(expected);
    const right = Buffer.from(supplied);
    return left.length === right.length && timingSafeEqual(left, right);
  }
}

export function metricsCredential(customHeader?: string, authorization?: string) {
  if (customHeader) return customHeader;
  const match = authorization?.match(/^Bearer\s+(.+)$/i);
  return match?.[1];
}
