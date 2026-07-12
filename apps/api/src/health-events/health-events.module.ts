import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { IdempotencyService } from '../common/idempotency.service';
import { FamiliesModule } from '../families/families.module';
import { HealthEventsController } from './health-events.controller';
import { HealthEventsService } from './health-events.service';

@Module({
  imports: [AuthModule, FamiliesModule],
  controllers: [HealthEventsController],
  providers: [HealthEventsService, IdempotencyService],
})
export class HealthEventsModule {}
