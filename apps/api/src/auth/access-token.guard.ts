import { CanActivate, ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import type { AuthenticatedRequest, AccessTokenPayload } from './auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { AppException } from '../common/app.exception';
import { Reflector } from '@nestjs/core';
import { ALLOW_PENDING_DELETION } from './allow-pending-deletion.decorator';

@Injectable()
export class AccessTokenGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const authorization = request.headers.authorization;
    const rawHeader = Array.isArray(authorization) ? authorization[0] : authorization;
    const token = rawHeader?.startsWith('Bearer ') ? rawHeader.slice(7) : null;
    if (!token) throw new AppException('UNAUTHENTICATED', '请先登录', HttpStatus.UNAUTHORIZED);

    try {
      const payload = await this.jwt.verifyAsync<AccessTokenPayload>(token, {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      });
      const session = await this.prisma.deviceSession.findFirst({
        where: {
          id: payload.sid,
          userId: payload.sub,
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
        select: { id: true, user: { select: { status: true } } },
      });
      if (!session) throw new Error('revoked');
      const allowPending = this.reflector.getAllAndOverride<boolean>(ALLOW_PENDING_DELETION, [
        context.getHandler(),
        context.getClass(),
      ]);
      if (
        session.user.status === 'DELETED' ||
        (session.user.status === 'PENDING_DELETION' && !allowPending)
      )
        throw new Error('inactive-user');
      request.user = payload;
      return true;
    } catch {
      throw new AppException(
        'TOKEN_INVALID',
        '登录状态已失效，请重新登录',
        HttpStatus.UNAUTHORIZED,
      );
    }
  }
}
