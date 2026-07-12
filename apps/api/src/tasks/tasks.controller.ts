import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { AccessTokenGuard } from '../auth/access-token.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AccessTokenPayload } from '../auth/auth.types';
import { parseWith } from '../common/zod-parse';
import { CurrentFamily } from '../families/current-family.decorator';
import { FamilyContextGuard } from '../families/family-context.guard';
import type { FamilyContext } from '../families/family-context.types';
import { TasksService } from './tasks.service';
import { IdempotencyService } from '../common/idempotency.service';

const idSchema = z.string().uuid();
const versionSchema = z.number().int().positive();
const completeSchema = z.object({
  actualAt: z.string().datetime(),
  result: z.unknown().optional(),
  note: z.string().max(500).optional(),
  version: versionSchema,
  medicalConfirmed: z.boolean().optional(),
});
const skipSchema = z.object({ note: z.string().max(500).optional(), version: versionSchema });

@ApiTags('tasks')
@ApiBearerAuth()
@UseGuards(AccessTokenGuard, FamilyContextGuard)
@Controller('tasks')
export class TasksController {
  constructor(
    private readonly tasks: TasksService,
    private readonly idempotency: IdempotencyService,
  ) {}

  @Get()
  list(
    @CurrentFamily() family: FamilyContext,
    @Query('scope') scope?: string,
    @Query('petId') petId?: string,
    @Query('assigneeId') assigneeId?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    return this.tasks.list(
      family.familyId,
      parseWith(z.enum(['today', 'upcoming', 'overdue', 'completed']).default('today'), scope),
      {
        ...(petId ? { petId: parseWith(idSchema, petId) } : {}),
        ...(assigneeId ? { assigneeId: parseWith(idSchema, assigneeId) } : {}),
        ...(cursor ? { cursor: parseWith(idSchema, cursor) } : {}),
        limit: parseWith(z.coerce.number().int().min(1).max(100).default(20), limit),
      },
    );
  }

  @Get(':id')
  get(@CurrentFamily() family: FamilyContext, @Param('id') id: string) {
    return this.tasks.get(family.familyId, parseWith(idSchema, id));
  }

  @Post(':id/complete')
  complete(
    @CurrentFamily() family: FamilyContext,
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key?: string,
  ) {
    const taskId = parseWith(idSchema, id);
    const input = parseWith(completeSchema, body);
    return this.idempotency.execute(user.sub, `POST /tasks/${taskId}/complete`, key, input, () =>
      this.tasks.complete(family.familyId, taskId, user.sub, input),
    );
  }

  @Post(':id/skip')
  skip(
    @CurrentFamily() family: FamilyContext,
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key?: string,
  ) {
    const taskId = parseWith(idSchema, id);
    const input = parseWith(skipSchema, body);
    return this.idempotency.execute(user.sub, `POST /tasks/${taskId}/skip`, key, input, () =>
      this.tasks.skip(family.familyId, taskId, user.sub, input),
    );
  }

  @Post(':id/undo')
  undo(
    @CurrentFamily() family: FamilyContext,
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key?: string,
  ) {
    const taskId = parseWith(idSchema, id);
    const input = parseWith(z.object({ version: versionSchema }), body);
    return this.idempotency.execute(user.sub, `POST /tasks/${taskId}/undo`, key, input, () =>
      this.tasks.undo(family.familyId, taskId, input.version),
    );
  }

  @Patch(':id/assignee')
  assign(@CurrentFamily() family: FamilyContext, @Param('id') id: string, @Body() body: unknown) {
    const input = parseWith(
      z.object({ assigneeId: idSchema.nullable(), version: versionSchema }),
      body,
    );
    return this.tasks.assign(
      family.familyId,
      parseWith(idSchema, id),
      input.assigneeId,
      input.version,
    );
  }
}
