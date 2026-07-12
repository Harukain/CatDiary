import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { DevicePlatform } from '@prisma/client';
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { AppException } from '../common/app.exception';
import { PrismaService } from '../prisma/prisma.service';
import { OtpService } from './otp.service';
import { PhoneSecurityService } from './phone-security.service';

interface DeviceInput {
  deviceId?: string;
  platform?: 'IOS' | 'ANDROID' | 'UNKNOWN';
  appVersion?: string;
  deviceName?: string;
}

@Injectable()
export class AuthService {
  private readonly accessTokenSeconds = 15 * 60;
  private readonly refreshTokenMs = 30 * 24 * 60 * 60 * 1000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly otp: OtpService,
    private readonly phoneSecurity: PhoneSecurityService,
  ) {}

  async sendSms(phone: string) {
    return this.otp.send(phone);
  }

  async verifySms(phone: string, code: string, device: DeviceInput) {
    await this.otp.verify(phone, code);
    const phoneHash = this.phoneSecurity.hash(phone);
    const user = await this.prisma.user.upsert({
      where: { phoneHash },
      create: { phoneHash, phoneEncrypted: this.phoneSecurity.encrypt(phone) },
      update: {},
    });
    const deviceId = device.deviceId?.trim() || randomUUID();
    const tokenFamilyId = randomUUID();
    const secret = this.newRefreshSecret();
    const expiresAt = new Date(Date.now() + this.refreshTokenMs);
    const session = await this.prisma.deviceSession.upsert({
      where: { userId_deviceId: { userId: user.id, deviceId } },
      create: {
        userId: user.id,
        deviceId,
        platform: this.platform(device.platform),
        appVersion: device.appVersion?.slice(0, 30),
        deviceName: device.deviceName?.slice(0, 80),
        tokenFamilyId,
        refreshTokenHash: this.refreshHash(secret),
        expiresAt,
      },
      update: {
        platform: this.platform(device.platform),
        appVersion: device.appVersion?.slice(0, 30),
        deviceName: device.deviceName?.slice(0, 80),
        tokenFamilyId,
        refreshTokenHash: this.refreshHash(secret),
        expiresAt,
        revokedAt: null,
        revokeReason: null,
        lastSeenAt: new Date(),
      },
    });
    return this.authPayload(user, session.id, `${session.id}.${secret}`);
  }

  async refresh(refreshToken: string) {
    const [sessionId, secret, ...extra] = refreshToken.split('.');
    if (!sessionId || !secret || extra.length) this.invalidRefresh();
    const session = await this.prisma.deviceSession.findUnique({
      where: { id: sessionId },
      include: { user: true },
    });
    if (!session || session.revokedAt || session.expiresAt <= new Date()) this.invalidRefresh();
    if (!this.safeEqual(session.refreshTokenHash, this.refreshHash(secret))) {
      await this.revokeTokenFamily(session.tokenFamilyId, 'refresh_token_reuse');
      throw new AppException(
        'REFRESH_TOKEN_REUSED',
        '登录凭证存在重复使用，请重新登录',
        HttpStatus.UNAUTHORIZED,
      );
    }

    const nextSecret = this.newRefreshSecret();
    const rotated = await this.prisma.deviceSession.updateMany({
      where: { id: session.id, refreshTokenHash: session.refreshTokenHash, revokedAt: null },
      data: { refreshTokenHash: this.refreshHash(nextSecret), lastSeenAt: new Date() },
    });
    if (!rotated.count) {
      await this.revokeTokenFamily(session.tokenFamilyId, 'concurrent_refresh_reuse');
      throw new AppException(
        'REFRESH_TOKEN_REUSED',
        '登录凭证存在重复使用，请重新登录',
        HttpStatus.UNAUTHORIZED,
      );
    }
    return this.authPayload(session.user, session.id, `${session.id}.${nextSecret}`);
  }

  async logout(userId: string, sessionId: string) {
    await this.prisma.$transaction(async (tx) => {
      await tx.deviceSession.updateMany({
        where: { id: sessionId, userId, revokedAt: null },
        data: { revokedAt: new Date(), revokeReason: 'logout' },
      });
      await tx.devicePushToken.updateMany({
        where: { userId, deviceSessionId: sessionId, active: true },
        data: { active: false },
      });
    });
  }

  async logoutAll(userId: string) {
    const revokedCount = await this.prisma.$transaction(async (tx) => {
      const result = await tx.deviceSession.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date(), revokeReason: 'logout_all' },
      });
      await tx.devicePushToken.updateMany({
        where: { userId, active: true },
        data: { active: false },
      });
      return result.count;
    });
    return { revokedCount };
  }

  async sessions(userId: string, currentSessionId: string) {
    const sessions = await this.prisma.deviceSession.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { lastSeenAt: 'desc' },
      select: {
        id: true,
        deviceId: true,
        platform: true,
        appVersion: true,
        deviceName: true,
        lastSeenAt: true,
        createdAt: true,
      },
    });
    return sessions.map((session) => ({ ...session, isCurrent: session.id === currentSessionId }));
  }

  async revokeSession(userId: string, sessionId: string, currentSessionId: string) {
    if (sessionId === currentSessionId) {
      throw new AppException(
        'CURRENT_SESSION_USE_LOGOUT',
        '请使用退出登录撤销当前设备',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }
    const result = await this.prisma.$transaction(async (tx) => {
      const revoked = await tx.deviceSession.updateMany({
        where: { id: sessionId, userId, revokedAt: null },
        data: { revokedAt: new Date(), revokeReason: 'revoked_by_user' },
      });
      if (revoked.count)
        await tx.devicePushToken.updateMany({
          where: { userId, deviceSessionId: sessionId, active: true },
          data: { active: false },
        });
      return revoked;
    });
    if (!result.count)
      throw new AppException('SESSION_NOT_FOUND', '设备会话不存在', HttpStatus.NOT_FOUND);
  }

  private async authPayload(
    user: { id: string; displayName: string | null },
    sessionId: string,
    refreshToken: string,
  ) {
    const accessToken = await this.jwt.signAsync(
      { sub: user.id, sid: sessionId, ver: 1 },
      {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
        expiresIn: this.accessTokenSeconds,
      },
    );
    const families = await this.prisma.membership.findMany({
      where: { userId: user.id, status: 'ACTIVE' },
      select: { role: true, family: { select: { id: true, name: true, timezone: true } } },
    });
    return {
      accessToken,
      refreshToken,
      expiresIn: this.accessTokenSeconds,
      user: { id: user.id, displayName: user.displayName },
      families: families.map(({ family, role }) => ({ ...family, role })),
    };
  }

  private refreshHash(secret: string) {
    return createHmac('sha256', this.config.getOrThrow<string>('JWT_REFRESH_SECRET'))
      .update(secret)
      .digest('hex');
  }
  private revokeTokenFamily(tokenFamilyId: string, reason: string) {
    return this.prisma.$transaction(async (tx) => {
      await tx.deviceSession.updateMany({
        where: { tokenFamilyId, revokedAt: null },
        data: { revokedAt: new Date(), revokeReason: reason },
      });
      await tx.devicePushToken.updateMany({
        where: { active: true, deviceSession: { tokenFamilyId } },
        data: { active: false },
      });
    });
  }

  private newRefreshSecret() {
    return randomBytes(32).toString('base64url');
  }
  private safeEqual(left: string, right: string) {
    return left.length === right.length && Buffer.from(left).equals(Buffer.from(right));
  }
  private platform(value?: DeviceInput['platform']) {
    return value && value in DevicePlatform ? DevicePlatform[value] : DevicePlatform.UNKNOWN;
  }
  private invalidRefresh(): never {
    throw new AppException(
      'REFRESH_TOKEN_INVALID',
      '刷新凭证无效，请重新登录',
      HttpStatus.UNAUTHORIZED,
    );
  }
}
