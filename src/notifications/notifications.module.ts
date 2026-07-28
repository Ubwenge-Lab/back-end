// backend/src/notifications/notifications.module.ts

import { Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { EmailService } from './email.service';
import { NotificationsGateway } from './notifications.gateway';
import { NotificationsController } from './notifications.controller';
import { DiscordService } from './discord.service';

@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService, EmailService, NotificationsGateway, DiscordService],
  exports: [NotificationsService, EmailService, NotificationsGateway, DiscordService],
})
export class NotificationsModule { }
