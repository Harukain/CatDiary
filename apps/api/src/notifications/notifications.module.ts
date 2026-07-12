import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { FamiliesModule } from '../families/families.module';
import {
  NotificationPreferencesController,
  NotificationsController,
} from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { ChannelsController } from './channels.controller';
import { ChannelSecretService } from './channel-secret.service';

@Module({
  imports: [AuthModule, FamiliesModule],
  controllers: [NotificationsController, NotificationPreferencesController, ChannelsController],
  providers: [NotificationsService, ChannelSecretService],
})
export class NotificationsModule {}
