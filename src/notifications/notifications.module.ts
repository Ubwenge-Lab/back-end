// backend/src/notifications/notifications.module.ts

import { Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { EmailService } from './email.service';
import { NotificationsController } from './notifications.controller';

@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService, EmailService],
  exports: [NotificationsService, EmailService],
})
export class NotificationsModule {}
