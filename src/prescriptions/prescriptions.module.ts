// backend/src/prescriptions/prescriptions.module.ts

import { Module } from '@nestjs/common';
import { PrescriptionsService } from './prescriptions.service';
import { PrescriptionsController } from './prescriptions.controller';
import { PatientsModule } from '../patients/patients.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { MedicationsModule } from '../medications/medications.module';

@Module({
  imports: [PatientsModule, NotificationsModule, MedicationsModule],
  controllers: [PrescriptionsController],
  providers: [PrescriptionsService],
  exports: [PrescriptionsService],
})
export class PrescriptionsModule {}
