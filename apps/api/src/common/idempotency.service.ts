import { HttpStatus, Injectable } from '@nestjs/common';
import { IdempotencyStatus, Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { AppException } from './app.exception';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class IdempotencyService {
  constructor(private readonly prisma: PrismaService) {}

  async execute<T>(
    userId: string,
    route: string,
    key: string | undefined,
    request: unknown,
    operation: () => Promise<T>,
  ): Promise<T> {
    if (!key) return operation();
    if (!/^[A-Za-z0-9._-]{8,100}$/.test(key)) {
      throw new AppException('INVALID_IDEMPOTENCY_KEY', '幂等键格式不正确', HttpStatus.BAD_REQUEST);
    }
    const requestHash = hashRequest(request);
    let reservation;
    try {
      reservation = await this.prisma.idempotencyRecord.create({
        data: {
          userId,
          route,
          key,
          requestHash,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002')
        throw error;
      const existing = await this.prisma.idempotencyRecord.findUnique({
        where: { userId_route_key: { userId, route, key } },
      });
      if (!existing) throw new AppException('IDEMPOTENCY_RETRY', '请重试请求', HttpStatus.CONFLICT);
      if (existing.requestHash !== requestHash) {
        throw new AppException(
          'IDEMPOTENCY_KEY_REUSED',
          '同一幂等键不能用于不同请求',
          HttpStatus.CONFLICT,
        );
      }
      if (existing.expiresAt <= new Date()) {
        await this.prisma.idempotencyRecord.delete({ where: { id: existing.id } });
        return this.execute(userId, route, key, request, operation);
      }
      if (existing.status === IdempotencyStatus.COMPLETED && existing.responseBody !== null) {
        return existing.responseBody as T;
      }
      throw new AppException('IDEMPOTENCY_IN_PROGRESS', '相同操作正在处理中', HttpStatus.CONFLICT);
    }

    try {
      const result = await operation();
      const serializable = JSON.parse(JSON.stringify(result)) as Prisma.InputJsonValue;
      await this.prisma.idempotencyRecord.update({
        where: { id: reservation.id },
        data: { status: IdempotencyStatus.COMPLETED, responseBody: serializable },
      });
      return result;
    } catch (error) {
      await this.prisma.idempotencyRecord.deleteMany({
        where: { id: reservation.id, status: IdempotencyStatus.PENDING },
      });
      throw error;
    }
  }
}

export function hashRequest(value: unknown) {
  return createHash('sha256').update(stableStringify(value)).digest('hex');
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(object[key])}`)
    .join(',')}}`;
}
