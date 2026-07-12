import { Module } from '@nestjs/common';
import { FamiliesController } from './families.controller';
import { FamiliesService } from './families.service';
import { FamilyContextGuard } from './family-context.guard';
import { RoleGuard } from './role.guard';
import { AuthModule } from '../auth/auth.module';
import { FamilyCollaborationController } from './family-collaboration.controller';
import { FamilyCollaborationService } from './family-collaboration.service';

@Module({
  imports: [AuthModule],
  controllers: [FamiliesController, FamilyCollaborationController],
  providers: [FamiliesService, FamilyCollaborationService, FamilyContextGuard, RoleGuard],
  exports: [FamilyContextGuard, RoleGuard],
})
export class FamiliesModule {}
