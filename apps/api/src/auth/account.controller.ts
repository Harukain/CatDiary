import { Body, Controller, Delete, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { otpSchema } from '@cat-diary/validation';
import { parseWith } from '../common/zod-parse';
import { AccessTokenGuard } from './access-token.guard';
import { AccountService } from './account.service';
import { AllowPendingDeletion } from './allow-pending-deletion.decorator';
import { CurrentUser } from './current-user.decorator';
import type { AccessTokenPayload } from './auth.types';

@ApiTags('account')
@ApiBearerAuth()
@UseGuards(AccessTokenGuard)
@AllowPendingDeletion()
@Controller('account')
export class AccountController {
  constructor(private readonly account: AccountService) {}

  @Get('deletion-status') status(@CurrentUser() user: AccessTokenPayload) {
    return this.account.status(user.sub);
  }
  @Post('deletion-code') deletionCode(@CurrentUser() user: AccessTokenPayload) {
    return this.account.sendDeletionCode(user.sub);
  }
  @Post('deletion-request') request(
    @CurrentUser() user: AccessTokenPayload,
    @Body() body: unknown,
  ) {
    return this.account.request(user.sub, parseWith(z.object({ code: otpSchema }), body).code);
  }
  @Delete('deletion-request') cancel(@CurrentUser() user: AccessTokenPayload) {
    return this.account.cancel(user.sub);
  }
}
