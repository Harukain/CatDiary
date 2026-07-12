import { HttpStatus } from '@nestjs/common';
import { z } from 'zod';
import { AppException } from './app.exception';

export function parseWith<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new AppException(
      'VALIDATION_ERROR',
      '请求参数不正确',
      HttpStatus.BAD_REQUEST,
      result.error.issues.map((issue) => ({ field: issue.path.join('.'), code: issue.code })),
    );
  }
  return result.data;
}
