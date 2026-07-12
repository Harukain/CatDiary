import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { FamilyContext } from './family-context.types';

export const CurrentFamily = createParamDecorator((_data: unknown, context: ExecutionContext) => {
  return context.switchToHttp().getRequest<Request & { family: FamilyContext }>().family;
});
