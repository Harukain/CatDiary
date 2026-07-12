import { HttpStatus, Injectable } from '@nestjs/common';
import { FamilyRole } from '@prisma/client';
import { AppException } from '../common/app.exception';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class FamiliesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string) {
    const memberships = await this.prisma.membership.findMany({
      where: { userId, status: 'ACTIVE', family: { deletedAt: null } },
      orderBy: { createdAt: 'asc' },
      select: {
        role: true,
        family: {
          select: { id: true, name: true, timezone: true, version: true, createdAt: true },
        },
      },
    });
    return memberships.map(({ family, role }) => ({ ...family, role }));
  }

  create(userId: string, name: string, timezone: string) {
    this.assertTimezone(timezone);
    return this.prisma.$transaction(async (tx) => {
      const family = await tx.family.create({ data: { name: name.trim(), timezone } });
      await tx.membership.create({
        data: { familyId: family.id, userId, role: FamilyRole.OWNER, status: 'ACTIVE' },
      });
      return { ...family, role: FamilyRole.OWNER };
    });
  }

  async get(userId: string, familyId: string) {
    const membership = await this.prisma.membership.findFirst({
      where: { userId, familyId, status: 'ACTIVE', family: { deletedAt: null } },
      select: { role: true, family: true },
    });
    if (!membership) throw new AppException('FAMILY_NOT_FOUND', '家庭不存在', HttpStatus.NOT_FOUND);
    return { ...membership.family, role: membership.role };
  }

  async update(
    userId: string,
    familyId: string,
    input: { name?: string; timezone?: string; version: number },
  ) {
    const membership = await this.prisma.membership.findFirst({
      where: { userId, familyId, status: 'ACTIVE' },
      select: { role: true },
    });
    if (!membership) throw new AppException('FAMILY_NOT_FOUND', '家庭不存在', HttpStatus.NOT_FOUND);
    if (membership.role === FamilyRole.MEMBER)
      throw new AppException('FORBIDDEN', '只有管理员可以修改家庭', HttpStatus.FORBIDDEN);
    if (input.timezone) this.assertTimezone(input.timezone);
    const result = await this.prisma.family.updateMany({
      where: { id: familyId, version: input.version, deletedAt: null },
      data: {
        ...(input.name ? { name: input.name.trim() } : {}),
        ...(input.timezone ? { timezone: input.timezone } : {}),
        version: { increment: 1 },
      },
    });
    if (!result.count)
      throw new AppException('VERSION_CONFLICT', '家庭信息已被其他成员修改', HttpStatus.CONFLICT);
    return this.get(userId, familyId);
  }

  private assertTimezone(timezone: string) {
    try {
      new Intl.DateTimeFormat('zh-CN', { timeZone: timezone }).format();
    } catch {
      throw new AppException('INVALID_TIMEZONE', '时区格式不正确', HttpStatus.BAD_REQUEST, [
        { field: 'timezone', code: 'INVALID_TIMEZONE' },
      ]);
    }
  }
}
