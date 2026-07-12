import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { FamiliesModule } from '../families/families.module';
import { ExportDownloadsController, ExportsController } from './exports.controller';
import { ExportsService } from './exports.service';
import { IdempotencyService } from '../common/idempotency.service';

@Module({
  imports: [AuthModule, FamiliesModule],
  controllers: [ExportsController, ExportDownloadsController],
  providers: [ExportsService, IdempotencyService],
})
export class ExportsModule {}
