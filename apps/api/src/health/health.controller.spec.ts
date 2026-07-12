import { describe, expect, it } from 'vitest';
import { HealthController } from './health.controller';
import type { PrismaService } from '../prisma/prisma.service';
import type { ConfigService } from '@nestjs/config';

describe('HealthController', () => {
  it('returns an ok status', () => {
    const controller = new HealthController(
      {} as PrismaService,
      { get: (_key: string, fallback: string) => fallback } as ConfigService,
    );
    expect(controller.liveness()).toMatchObject({ status: 'ok', service: 'cat-diary-api' });
    void controller.onModuleDestroy();
  });
});
