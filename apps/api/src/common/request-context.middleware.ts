import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import type { AccessTokenPayload } from '../auth/auth.types';
import { MetricsService } from './metrics.service';

@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  constructor(private readonly metrics: MetricsService) {}

  use(
    request: Request & { requestId?: string; user?: AccessTokenPayload },
    response: Response,
    next: NextFunction,
  ) {
    const supplied = request.header('X-Request-Id');
    request.requestId =
      supplied && /^[A-Za-z0-9._-]{8,100}$/.test(supplied) ? supplied : randomUUID();
    response.setHeader('X-Request-Id', request.requestId);
    const startedAt = process.hrtime.bigint();
    response.once('finish', () => {
      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
      const route = request.route?.path
        ? `${request.baseUrl}${String(request.route.path)}`
        : 'unmatched';
      const status = String(response.statusCode);
      this.metrics.requests.inc({ method: request.method, route, status });
      this.metrics.duration.observe({ method: request.method, route, status }, durationMs / 1000);
      console.info(
        JSON.stringify({
          level: 'info',
          service: 'cat-diary-api',
          requestId: request.requestId,
          method: request.method,
          route: request.path,
          routeTemplate: route,
          status: response.statusCode,
          durationMs: Math.round(durationMs * 10) / 10,
          userId: request.user?.sub,
          familyId: request.header('X-Family-Id') || undefined,
        }),
      );
    });
    next();
  }
}
