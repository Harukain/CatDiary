import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { FamilyRole, NotificationStatus } from '@prisma/client';
import { z } from 'zod';
import { AccessTokenGuard } from '../auth/access-token.guard';
import { parseWith } from '../common/zod-parse';
import { CurrentFamily } from '../families/current-family.decorator';
import { FamilyContextGuard } from '../families/family-context.guard';
import type { FamilyContext } from '../families/family-context.types';
import { RoleGuard } from '../families/role.guard';
import { FamilyRoles } from '../families/roles.decorator';
import { NotificationsService } from './notifications.service';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AccessTokenPayload } from '../auth/auth.types';

const idSchema = z.string().uuid();

@ApiTags('notifications')
@ApiBearerAuth()
@UseGuards(AccessTokenGuard, FamilyContextGuard, RoleGuard)
@Controller('notification-logs')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(
    @CurrentFamily() family: FamilyContext,
    @Query('status') status?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    return this.notifications.list(family.familyId, {
      ...(status ? { status: parseWith(z.nativeEnum(NotificationStatus), status) } : {}),
      ...(cursor ? { cursor: parseWith(idSchema, cursor) } : {}),
      limit: parseWith(z.coerce.number().int().min(1).max(100).default(20), limit),
    });
  }

  @Post(':id/retry')
  @FamilyRoles(FamilyRole.OWNER, FamilyRole.ADMIN)
  retry(@CurrentFamily() family: FamilyContext, @Param('id') id: string) {
    return this.notifications.retry(family.familyId, parseWith(idSchema, id));
  }
}

@ApiTags('notification preferences')
@ApiBearerAuth()
@UseGuards(AccessTokenGuard, FamilyContextGuard, RoleGuard)
@Controller('notification-preferences')
export class NotificationPreferencesController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get('me')
  get(@CurrentFamily() family: FamilyContext, @CurrentUser() user: AccessTokenPayload) {
    return this.notifications.preference(family.familyId, user.sub);
  }

  @Patch('me')
  update(
    @CurrentFamily() family: FamilyContext,
    @CurrentUser() user: AccessTokenPayload,
    @Body() body: unknown,
  ) {
    const input = parseWith(
      z
        .object({
          taskReminderEnabled: z.boolean().optional(),
          pushEnabled: z.boolean().optional(),
          overdueEnabled: z.boolean().optional(),
        })
        .refine((value) => Object.keys(value).length > 0, '至少修改一个通知选项'),
      body,
    );
    return this.notifications.updatePreference(family.familyId, user.sub, input);
  }

  @Post('me/test-push')
  @HttpCode(200)
  testPush(@CurrentFamily() family: FamilyContext, @CurrentUser() user: AccessTokenPayload) {
    return this.notifications.testCurrentDevicePush(family.familyId, user.sub, user.sid);
  }
}
