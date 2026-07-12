import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { FamiliesModule } from '../families/families.module';
import { MedicalRecordsController } from './medical-records.controller';
import { MedicalRecordsService } from './medical-records.service';
import { MedicalSummaryPdfService } from './medical-summary-pdf.service';
@Module({
  imports: [AuthModule, FamiliesModule],
  controllers: [MedicalRecordsController],
  providers: [MedicalRecordsService, MedicalSummaryPdfService],
})
export class MedicalRecordsModule {}
