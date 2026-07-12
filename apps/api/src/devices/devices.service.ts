import { HttpStatus, Injectable } from '@nestjs/common';
import { DevicePlatform, PushProvider } from '@prisma/client';
import { AppException } from '../common/app.exception';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DevicesService {
  constructor(private readonly prisma: PrismaService) {}

  async register(
    userId: string,
    sessionId: string,
    input: { token: string; platform: DevicePlatform; provider: PushProvider },
  ) {
    const session = await this.prisma.deviceSession.count({
      where: { id: sessionId, userId, revokedAt: null },
    });
    if (!session)
      throw new AppException('SESSION_NOT_FOUND', '设备会话不存在', HttpStatus.UNAUTHORIZED);
    return this.prisma.$transaction(async (tx) => {
      await tx.devicePushToken.updateMany({
        where: { deviceSessionId: sessionId, token: { not: input.token }, active: true },
        data: { active: false },
      });
      return tx.devicePushToken.upsert({
        where: { token: input.token },
        create: {
          userId,
          deviceSessionId: sessionId,
          token: input.token,
          platform: input.platform,
          provider: input.provider,
        },
        update: {
          userId,
          deviceSessionId: sessionId,
          platform: input.platform,
          provider: input.provider,
          active: true,
          lastSeenAt: new Date(),
        },
        select: { id: true, provider: true, platform: true, active: true, lastSeenAt: true },
      });
    });
  }

  async remove(userId: string, id: string) {
    const result = await this.prisma.devicePushToken.updateMany({
      where: { id, userId, active: true },
      data: { active: false },
    });
    if (!result.count)
      throw new AppException('PUSH_TOKEN_NOT_FOUND', '推送设备不存在', HttpStatus.NOT_FOUND);
  }
}
