import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { FamiliesModule } from '../families/families.module';
import { PlansController } from './plans.controller';
import { PlansService } from './plans.service';
import { TaskGenerationService } from './task-generation.service';

@Module({
  imports: [AuthModule, FamiliesModule],
  controllers: [PlansController],
  providers: [PlansService, TaskGenerationService],
  exports: [TaskGenerationService],
})
export class PlansModule {}
