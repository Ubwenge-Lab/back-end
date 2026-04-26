// backend/src/super-admin/super-admin.module.ts

import { Module } from '@nestjs/common';
import { SuperAdminService } from './super-admin.service';
import { SuperAdminController } from './super-admin.controller';
import { PharmaciesModule } from '../pharmacies/pharmacies.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [PharmaciesModule, NotificationsModule],
  controllers: [SuperAdminController],
  providers: [SuperAdminService],
  exports: [SuperAdminService],
})
export class SuperAdminModule {}
