import { Body, Controller, Delete, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { phoneSchema, otpSchema } from '@cat-diary/validation';
import { AuthService } from './auth.service';
import { AccessTokenGuard } from './access-token.guard';
import { CurrentUser } from './current-user.decorator';
import type { AccessTokenPayload } from './auth.types';
import { parseWith } from '../common/zod-parse';
import { Throttle } from '@nestjs/throttler';

const sendSchema = z.object({
  phone: phoneSchema,
  purpose: z.enum(['login', 'recentAuth']).default('login'),
});
const verifySchema = z.object({
  phone: phoneSchema,
  code: otpSchema,
  device: z
    .object({
      deviceId: z.string().min(1).max(100).optional(),
      platform: z.enum(['IOS', 'ANDROID', 'UNKNOWN']).optional(),
      appVersion: z.string().max(30).optional(),
      deviceName: z.string().max(80).optional(),
    })
    .default({}),
});
const refreshSchema = z.object({ refreshToken: z.string().min(20).max(500) });
const smsSendLimit = Number(process.env.THROTTLE_SMS_SEND_LIMIT ?? 5);
const smsVerifyLimit = Number(process.env.THROTTLE_SMS_VERIFY_LIMIT ?? 10);

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('sms/send')
  @Throttle({ default: { limit: smsSendLimit, ttl: 60_000 } })
  @HttpCode(200)
  send(@Body() body: unknown) {
    const input = parseWith(sendSchema, body);
    return this.auth.sendSms(input.phone);
  }

  @Post('sms/verify')
  @Throttle({ default: { limit: smsVerifyLimit, ttl: 60_000 } })
  @HttpCode(200)
  verify(@Body() body: unknown) {
    const input = parseWith(verifySchema, body);
    return this.auth.verifySms(input.phone, input.code, input.device);
  }

  @Post('refresh')
  @HttpCode(200)
  refresh(@Body() body: unknown) {
    return this.auth.refresh(parseWith(refreshSchema, body).refreshToken);
  }

  @Post('logout')
  @HttpCode(204)
  @UseGuards(AccessTokenGuard)
  @ApiBearerAuth()
  logout(@CurrentUser() user: AccessTokenPayload) {
    return this.auth.logout(user.sub, user.sid);
  }

  @Post('logout-all')
  @UseGuards(AccessTokenGuard)
  @ApiBearerAuth()
  logoutAll(@CurrentUser() user: AccessTokenPayload) {
    return this.auth.logoutAll(user.sub);
  }

  @Get('sessions')
  @UseGuards(AccessTokenGuard)
  @ApiBearerAuth()
  sessions(@CurrentUser() user: AccessTokenPayload) {
    return this.auth.sessions(user.sub, user.sid);
  }

  @Delete('sessions/:id')
  @HttpCode(204)
  @UseGuards(AccessTokenGuard)
  @ApiBearerAuth()
  revoke(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) {
    return this.auth.revokeSession(user.sub, id, user.sid);
  }
}
