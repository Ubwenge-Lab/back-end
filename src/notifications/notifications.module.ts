// backend/src/notifications/notifications.module.ts

import { Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { EmailService } from './email.service';
import { NotificationsGateway } from './notifications.gateway';
import { NotificationsController } from './notifications.controller';

@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService, EmailService, NotificationsGateway],
  exports: [NotificationsService, EmailService, NotificationsGateway],
})
export class NotificationsModule {}
