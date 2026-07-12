import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FamilyRole, Prisma } from '@prisma/client';
import { createHash, randomBytes } from 'node:crypto';
import { PhoneSecurityService } from '../auth/phone-security.service';
import { AppException } from '../common/app.exception';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class FamilyCollaborationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly phoneSecurity: PhoneSecurityService,
    private readonly config: ConfigService,
  ) {}

  async createInvite(actorUserId: string, familyId: string, phone: string, role: FamilyRole) {
    await this.requireAdmin(actorUserId, familyId);
    const phoneHash = this.phoneSecurity.hash(phone);
    const existingMember = await this.prisma.user.count({
      where: { phoneHash, memberships: { some: { familyId, status: 'ACTIVE' } } },
    });
    if (existingMember)
      throw new AppException('ALREADY_MEMBER', '该用户已加入家庭', HttpStatus.UNPROCESSABLE_ENTITY);

    const token = randomBytes(32).toString('base64url');
    const tokenHash = this.tokenHash(token);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const invite = await this.prisma.$transaction(async (tx) => {
      await tx.familyInvite.updateMany({
        where: { familyId, phoneHash, acceptedAt: null, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      const created = await tx.familyInvite.create({
        data: { familyId, phoneHash, tokenHash, role, expiresAt, invitedById: actorUserId },
        select: { id: true, role: true, expiresAt: true, createdAt: true },
      });
      await tx.auditLog.create({
        data: {
          familyId,
          actorUserId,
          action: 'family.invite.create',
          resourceType: 'family_invite',
          resourceId: created.id,
          afterSafe: { role },
        },
      });
      return created;
    });
    return { ...invite, ...(this.config.get('NODE_ENV') !== 'production' ? { token } : {}) };
  }

  async acceptInvite(userId: string, token: string) {
    const tokenHash = this.tokenHash(token);
    return this.prisma.$transaction(
      async (tx) => {
        const user = await tx.user.findUnique({
          where: { id: userId },
          select: { phoneHash: true },
        });
        const invite = await tx.familyInvite.findUnique({ where: { tokenHash } });
        if (!invite || invite.revokedAt || invite.acceptedAt || invite.expiresAt <= new Date()) {
          throw new AppException('INVITE_INVALID', '邀请已失效', HttpStatus.GONE);
        }
        if (!user || user.phoneHash !== invite.phoneHash) {
          throw new AppException(
            'INVITE_PHONE_MISMATCH',
            '该邀请不属于当前手机号',
            HttpStatus.FORBIDDEN,
          );
        }
        const existing = await tx.membership.findUnique({
          where: { familyId_userId: { familyId: invite.familyId, userId } },
        });
        const role =
          existing && existing.status === 'ACTIVE' && existing.role !== FamilyRole.MEMBER
            ? existing.role
            : invite.role;
        const membership = await tx.membership.upsert({
          where: { familyId_userId: { familyId: invite.familyId, userId } },
          create: { familyId: invite.familyId, userId, role, status: 'ACTIVE' },
          update: { role, status: 'ACTIVE' },
          select: { id: true, familyId: true, role: true, status: true },
        });
        await tx.familyInvite.update({
          where: { id: invite.id },
          data: { acceptedAt: new Date() },
        });
        await tx.auditLog.create({
          data: {
            familyId: invite.familyId,
            actorUserId: userId,
            action: 'family.invite.accept',
            resourceType: 'membership',
            resourceId: membership.id,
            afterSafe: { role },
          },
        });
        const family = await tx.family.findUniqueOrThrow({
          where: { id: invite.familyId },
          select: { id: true, name: true, timezone: true, version: true },
        });
        return { ...family, role: membership.role };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async members(actorUserId: string, familyId: string) {
    await this.requireMember(actorUserId, familyId);
    return this.prisma.membership.findMany({
      where: { familyId, status: 'ACTIVE' },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        role: true,
        status: true,
        createdAt: true,
        user: { select: { id: true, displayName: true } },
      },
    });
  }

  async changeRole(actorUserId: string, familyId: string, membershipId: string, role: FamilyRole) {
    return this.prisma.$transaction(
      async (tx) => {
        await this.requireAdmin(actorUserId, familyId, tx);
        const target = await tx.membership.findFirst({
          where: { id: membershipId, familyId, status: 'ACTIVE' },
        });
        if (!target)
          throw new AppException('MEMBER_NOT_FOUND', '家庭成员不存在', HttpStatus.NOT_FOUND);
        if (target.role !== FamilyRole.MEMBER && role === FamilyRole.MEMBER)
          await this.assertAnotherAdmin(tx, familyId, target.id);
        const updated = await tx.membership.update({
          where: { id: target.id },
          data: { role },
          select: { id: true, userId: true, role: true, status: true },
        });
        await tx.auditLog.create({
          data: {
            familyId,
            actorUserId,
            action: 'family.member.role_change',
            resourceType: 'membership',
            resourceId: target.id,
            beforeSafe: { role: target.role },
            afterSafe: { role },
          },
        });
        return updated;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async removeMember(actorUserId: string, familyId: string, membershipId: string) {
    return this.prisma.$transaction(
      async (tx) => {
        await this.requireAdmin(actorUserId, familyId, tx);
        const target = await tx.membership.findFirst({
          where: { id: membershipId, familyId, status: 'ACTIVE' },
        });
        if (!target)
          throw new AppException('MEMBER_NOT_FOUND', '家庭成员不存在', HttpStatus.NOT_FOUND);
        if (target.userId === actorUserId)
          throw new AppException(
            'USE_LEAVE_ENDPOINT',
            '请使用退出家庭操作',
            HttpStatus.UNPROCESSABLE_ENTITY,
          );
        if (target.role !== FamilyRole.MEMBER)
          await this.assertAnotherAdmin(tx, familyId, target.id);
        await tx.membership.update({ where: { id: target.id }, data: { status: 'LEFT' } });
        await this.clearAssignments(tx, familyId, target.userId);
        await tx.auditLog.create({
          data: {
            familyId,
            actorUserId,
            action: 'family.member.remove',
            resourceType: 'membership',
            resourceId: target.id,
            beforeSafe: { role: target.role, status: target.status },
            afterSafe: { status: 'LEFT' },
          },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async leave(userId: string, familyId: string) {
    return this.prisma.$transaction(
      async (tx) => {
        const membership = await tx.membership.findFirst({
          where: { familyId, userId, status: 'ACTIVE' },
        });
        if (!membership)
          throw new AppException('FAMILY_NOT_FOUND', '家庭不存在', HttpStatus.NOT_FOUND);
        if (membership.role !== FamilyRole.MEMBER)
          await this.assertAnotherAdmin(tx, familyId, membership.id);
        await tx.membership.update({ where: { id: membership.id }, data: { status: 'LEFT' } });
        await this.clearAssignments(tx, familyId, userId);
        await tx.auditLog.create({
          data: {
            familyId,
            actorUserId: userId,
            action: 'family.member.leave',
            resourceType: 'membership',
            resourceId: membership.id,
            beforeSafe: { role: membership.role },
            afterSafe: { status: 'LEFT' },
          },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  private async requireMember(
    userId: string,
    familyId: string,
    tx: Prisma.TransactionClient = this.prisma,
  ) {
    const membership = await tx.membership.findFirst({
      where: { userId, familyId, status: 'ACTIVE', family: { deletedAt: null } },
    });
    if (!membership) throw new AppException('FAMILY_NOT_FOUND', '家庭不存在', HttpStatus.NOT_FOUND);
    return membership;
  }

  private async clearAssignments(tx: Prisma.TransactionClient, familyId: string, userId: string) {
    await Promise.all([
      tx.plan.updateMany({
        where: { familyId, assigneeId: userId, deletedAt: null },
        data: { assigneeId: null, version: { increment: 1 } },
      }),
      tx.task.updateMany({
        where: { familyId, assigneeId: userId, status: 'PENDING', deletedAt: null },
        data: { assigneeId: null, version: { increment: 1 } },
      }),
    ]);
  }

  private async requireAdmin(
    userId: string,
    familyId: string,
    tx: Prisma.TransactionClient = this.prisma,
  ) {
    const membership = await this.requireMember(userId, familyId, tx);
    if (membership.role === FamilyRole.MEMBER)
      throw new AppException('FORBIDDEN', '只有管理员可以执行此操作', HttpStatus.FORBIDDEN);
    return membership;
  }

  private async assertAnotherAdmin(
    tx: Prisma.TransactionClient,
    familyId: string,
    excludedMembershipId: string,
  ) {
    const count = await tx.membership.count({
      where: {
        familyId,
        id: { not: excludedMembershipId },
        status: 'ACTIVE',
        role: { in: [FamilyRole.OWNER, FamilyRole.ADMIN] },
      },
    });
    if (!count)
      throw new AppException(
        'LAST_ADMIN_REQUIRED',
        '家庭必须至少保留一名管理员',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
  }

  private tokenHash(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }
}
