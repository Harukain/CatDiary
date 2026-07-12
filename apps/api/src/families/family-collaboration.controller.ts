import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { FamilyRole } from '@prisma/client';
import { z } from 'zod';
import { phoneSchema } from '@cat-diary/validation';
import { AccessTokenGuard } from '../auth/access-token.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AccessTokenPayload } from '../auth/auth.types';
import { parseWith } from '../common/zod-parse';
import { FamilyCollaborationService } from './family-collaboration.service';

const uuidSchema = z.string().uuid();
const inviteSchema = z.object({
  phone: phoneSchema,
  role: z.enum([FamilyRole.ADMIN, FamilyRole.MEMBER]).default(FamilyRole.MEMBER),
});
const roleSchema = z.object({ role: z.enum([FamilyRole.ADMIN, FamilyRole.MEMBER]) });
const tokenSchema = z.string().min(32).max(200);

@ApiTags('family collaboration')
@ApiBearerAuth()
@UseGuards(AccessTokenGuard)
@Controller()
export class FamilyCollaborationController {
  constructor(private readonly collaboration: FamilyCollaborationService) {}

  @Post('families/:id/invites')
  createInvite(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const input = parseWith(inviteSchema, body);
    return this.collaboration.createInvite(
      user.sub,
      parseWith(uuidSchema, id),
      input.phone,
      input.role,
    );
  }

  @Post('family-invites/:token/accept')
  accept(@CurrentUser() user: AccessTokenPayload, @Param('token') token: string) {
    return this.collaboration.acceptInvite(user.sub, parseWith(tokenSchema, token));
  }

  @Get('families/:id/members')
  members(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) {
    return this.collaboration.members(user.sub, parseWith(uuidSchema, id));
  }

  @Patch('families/:id/members/:memberId')
  changeRole(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Param('memberId') memberId: string,
    @Body() body: unknown,
  ) {
    return this.collaboration.changeRole(
      user.sub,
      parseWith(uuidSchema, id),
      parseWith(uuidSchema, memberId),
      parseWith(roleSchema, body).role,
    );
  }

  @Delete('families/:id/members/:memberId')
  @HttpCode(204)
  remove(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Param('memberId') memberId: string,
  ) {
    return this.collaboration.removeMember(
      user.sub,
      parseWith(uuidSchema, id),
      parseWith(uuidSchema, memberId),
    );
  }

  @Post('families/:id/leave')
  @HttpCode(204)
  leave(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) {
    return this.collaboration.leave(user.sub, parseWith(uuidSchema, id));
  }
}
