import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { FamiliesModule } from '../families/families.module';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';
import { IdempotencyService } from '../common/idempotency.service';

@Module({
  imports: [AuthModule, FamiliesModule],
  controllers: [TasksController],
  providers: [TasksService, IdempotencyService],
})
export class TasksModule {}
