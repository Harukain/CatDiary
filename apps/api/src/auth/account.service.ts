import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AppException } from '../common/app.exception';
import { PrismaService } from '../prisma/prisma.service';
import { OtpService } from './otp.service';
import { PhoneSecurityService } from './phone-security.service';

const COOLING_MS = 7 * 24 * 60 * 60 * 1000;

@Injectable()
export class AccountService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly otp: OtpService,
    private readonly phones: PhoneSecurityService,
  ) {}

  async sendDeletionCode(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { phoneEncrypted: true },
    });
    if (!user) throw new AppException('USER_NOT_FOUND', '账号不存在', HttpStatus.NOT_FOUND);
    const phone = this.phones.decrypt(user.phoneEncrypted);
    const result = await this.otp.send(phone);
    return { ...result, maskedPhone: `${phone.slice(0, 3)}****${phone.slice(-4)}` };
  }

  async status(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { status: true, deletionRequestedAt: true },
    });
    if (!user) throw new AppException('USER_NOT_FOUND', '账号不存在', HttpStatus.NOT_FOUND);
    const coolingEndsAt = user.deletionRequestedAt
      ? new Date(user.deletionRequestedAt.getTime() + COOLING_MS)
      : null;
    return {
      status: user.status,
      requestedAt: user.deletionRequestedAt,
      coolingEndsAt,
      canCancel:
        user.status === 'PENDING_DELETION' && !!coolingEndsAt && coolingEndsAt > new Date(),
    };
  }

  async request(userId: string, code: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { status: true, phoneEncrypted: true },
    });
    if (!user) throw new AppException('USER_NOT_FOUND', '账号不存在', HttpStatus.NOT_FOUND);
    await this.otp.verify(this.phones.decrypt(user.phoneEncrypted), code);
    if (user.status === 'PENDING_DELETION') return this.status(userId);
    if (user.status === 'DELETED')
      throw new AppException('ACCOUNT_DELETED', '账号已经注销', HttpStatus.GONE);
    const managed = await this.prisma.membership.findMany({
      where: { userId, status: 'ACTIVE', role: { in: ['OWNER', 'ADMIN'] } },
      select: { familyId: true, family: { select: { name: true } } },
    });
    const blocking: Array<{ id: string; name: string }> = [];
    for (const membership of managed) {
      const others = await this.prisma.membership.count({
        where: {
          familyId: membership.familyId,
          userId: { not: userId },
          status: 'ACTIVE',
          role: { in: ['OWNER', 'ADMIN'] },
        },
      });
      if (!others) blocking.push({ id: membership.familyId, name: membership.family.name });
    }
    if (blocking.length)
      throw new AppException(
        'ADMIN_TRANSFER_REQUIRED',
        '请先为相关家庭保留另一位管理员',
        HttpStatus.UNPROCESSABLE_ENTITY,
        undefined,
        { families: blocking },
      );
    const requestedAt = new Date();
    await this.prisma.$transaction(
      async (tx) => {
        await tx.user.update({
          where: { id: userId },
          data: { status: 'PENDING_DELETION', deletionRequestedAt: requestedAt },
        });
        await tx.deviceSession.updateMany({
          where: { userId, revokedAt: null },
          data: { revokedAt: requestedAt, revokeReason: 'account_deletion_requested' },
        });
        await tx.devicePushToken.updateMany({
          where: { userId, active: true },
          data: { active: false },
        });
        await tx.accountAuditLog.create({
          data: {
            actorUserId: userId,
            action: 'account.deletion.request',
            safeData: { coolingDays: 7 },
          },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    return {
      status: 'PENDING_DELETION',
      requestedAt,
      coolingEndsAt: new Date(requestedAt.getTime() + COOLING_MS),
      canCancel: true,
    };
  }

  async cancel(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { status: true, deletionRequestedAt: true },
    });
    if (!user || user.status !== 'PENDING_DELETION' || !user.deletionRequestedAt)
      throw new AppException(
        'DELETION_REQUEST_NOT_FOUND',
        '没有可取消的注销申请',
        HttpStatus.NOT_FOUND,
      );
    if (user.deletionRequestedAt.getTime() + COOLING_MS <= Date.now())
      throw new AppException('DELETION_COOLING_EXPIRED', '注销冷静期已经结束', HttpStatus.GONE);
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { status: 'ACTIVE', deletionRequestedAt: null },
      }),
      this.prisma.accountAuditLog.create({
        data: { actorUserId: userId, action: 'account.deletion.cancel' },
      }),
    ]);
    return this.status(userId);
  }
}
