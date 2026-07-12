import { CanActivate, ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { AppException } from '../common/app.exception';
import { FAMILY_ROLES_KEY } from './roles.decorator';
import type { FamilyContext } from './family-context.types';

@Injectable()
export class RoleGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}
  canActivate(context: ExecutionContext) {
    const roles = this.reflector.getAllAndOverride<FamilyContext['role'][] | undefined>(
      FAMILY_ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!roles?.length) return true;
    const family = context.switchToHttp().getRequest<Request & { family: FamilyContext }>().family;
    if (!roles.includes(family.role))
      throw new AppException('FORBIDDEN', '你没有执行此操作的权限', HttpStatus.FORBIDDEN);
    return true;
  }
}
