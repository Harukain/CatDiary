import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { FamiliesModule } from '../families/families.module';
import { RecordsController } from './records.controller';
import { RecordsService } from './records.service';
import { IdempotencyService } from '../common/idempotency.service';

@Module({
  imports: [AuthModule, FamiliesModule],
  controllers: [RecordsController],
  providers: [RecordsService, IdempotencyService],
})
export class RecordsModule {}
