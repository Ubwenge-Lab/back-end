// backend/src/medications/medications.module.ts

import { Module } from '@nestjs/common';
import { MedicationsService } from './medications.service';
import { MedicationsController } from './medications.controller';
import { PharmaciesModule } from '../pharmacies/pharmacies.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { StaffModule } from '../staff/staff.module';

@Module({
  imports: [PharmaciesModule, NotificationsModule, StaffModule],
  controllers: [MedicationsController],
  providers: [MedicationsService],
  exports: [MedicationsService],
})
export class MedicationsModule {}