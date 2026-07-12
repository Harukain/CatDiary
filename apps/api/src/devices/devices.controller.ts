import { Body, Controller, Delete, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { DevicePlatform, PushProvider } from '@prisma/client';
import { z } from 'zod';
import { AccessTokenGuard } from '../auth/access-token.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AccessTokenPayload } from '../auth/auth.types';
import { parseWith } from '../common/zod-parse';
import { DevicesService } from './devices.service';

const registerSchema = z.object({
  token: z.string().min(20).max(500),
  provider: z.nativeEnum(PushProvider).default(PushProvider.EXPO),
  platform: z.nativeEnum(DevicePlatform),
});

@ApiTags('devices')
@ApiBearerAuth()
@UseGuards(AccessTokenGuard)
@Controller('devices')
export class DevicesController {
  constructor(private readonly devices: DevicesService) {}

  @Post('push-token')
  register(@CurrentUser() user: AccessTokenPayload, @Body() body: unknown) {
    return this.devices.register(user.sub, user.sid, parseWith(registerSchema, body));
  }

  @Delete('push-token/:id')
  @HttpCode(204)
  remove(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) {
    return this.devices.remove(user.sub, parseWith(z.string().uuid(), id));
  }
}
