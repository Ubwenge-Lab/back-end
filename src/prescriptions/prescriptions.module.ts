// backend/src/prescriptions/prescriptions.module.ts

import { Module } from '@nestjs/common';
import { PrescriptionsService } from './prescriptions.service';
import { PrescriptionsController } from './prescriptions.controller';
import { PatientsModule } from '../patients/patients.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { MedicationsModule } from '../medications/medications.module';
import { StaffModule } from '../staff/staff.module';

@Module({
  imports: [PatientsModule, NotificationsModule, MedicationsModule, StaffModule],
  controllers: [PrescriptionsController],
  providers: [PrescriptionsService],
  exports: [PrescriptionsService],
})
export class PrescriptionsModule {}
