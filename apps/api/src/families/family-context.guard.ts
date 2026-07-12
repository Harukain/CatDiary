import { CanActivate, ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import { AppException } from '../common/app.exception';
import { PrismaService } from '../prisma/prisma.service';
import type { AccessTokenPayload } from '../auth/auth.types';
import type { FamilyContext } from './family-context.types';

@Injectable()
export class FamilyContextGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext) {
    const request = context
      .switchToHttp()
      .getRequest<Request & { user: AccessTokenPayload; family: FamilyContext }>();
    const familyId = request.header('X-Family-Id');
    if (!familyId || !z.string().uuid().safeParse(familyId).success) {
      throw new AppException('FAMILY_CONTEXT_REQUIRED', '请选择家庭', HttpStatus.BAD_REQUEST);
    }
    const membership = await this.prisma.membership.findFirst({
      where: { familyId, userId: request.user.sub, status: 'ACTIVE', family: { deletedAt: null } },
      select: { id: true, familyId: true, role: true },
    });
    if (!membership) throw new AppException('FAMILY_NOT_FOUND', '家庭不存在', HttpStatus.NOT_FOUND);
    request.family = {
      membershipId: membership.id,
      familyId: membership.familyId,
      role: membership.role,
    };
    return true;
  }
}
