import { Body, Controller, Delete, Get, HttpCode, Put, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { FamilyRole } from '@prisma/client';
import { z } from 'zod';
import { AccessTokenGuard } from '../auth/access-token.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AccessTokenPayload } from '../auth/auth.types';
import { parseWith } from '../common/zod-parse';
import { CurrentFamily } from '../families/current-family.decorator';
import { FamilyContextGuard } from '../families/family-context.guard';
import type { FamilyContext } from '../families/family-context.types';
import { RoleGuard } from '../families/role.guard';
import { FamilyRoles } from '../families/roles.decorator';
import { NotificationsService } from './notifications.service';

@ApiTags('notification channels')
@ApiBearerAuth()
@UseGuards(AccessTokenGuard, FamilyContextGuard, RoleGuard)
@Controller('notification-channels')
export class ChannelsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(@CurrentFamily() family: FamilyContext) {
    return this.notifications.channels(family.familyId);
  }

  @Put('feishu')
  @FamilyRoles(FamilyRole.OWNER, FamilyRole.ADMIN)
  configure(
    @CurrentFamily() family: FamilyContext,
    @CurrentUser() user: AccessTokenPayload,
    @Body() body: unknown,
  ) {
    const input = parseWith(z.object({ webhookUrl: z.string().url().max(500) }), body);
    return this.notifications.configureFeishu(family.familyId, user.sub, input.webhookUrl);
  }

  @Post('feishu/test')
  @FamilyRoles(FamilyRole.OWNER, FamilyRole.ADMIN)
  test(@CurrentFamily() family: FamilyContext) {
    return this.notifications.testFeishu(family.familyId);
  }

  @Delete('feishu')
  @HttpCode(204)
  @FamilyRoles(FamilyRole.OWNER, FamilyRole.ADMIN)
  remove(@CurrentFamily() family: FamilyContext, @CurrentUser() user: AccessTokenPayload) {
    return this.notifications.removeFeishu(family.familyId, user.sub);
  }
}
