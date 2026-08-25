// backend/src/prescriptions/prescriptions.module.ts

import { Module, forwardRef } from '@nestjs/common';
import { PrescriptionsService } from './prescriptions.service';
import { PrescriptionsController } from './prescriptions.controller';
import { PatientsModule } from '../patients/patients.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { MedicationsModule } from '../medications/medications.module';
import { StaffModule } from '../staff/staff.module';
import { OrdersModule } from '../orders/orders.module';
import { HospitalsModule } from '../hospitals/hospitals.module';

@Module({
  imports: [
    PatientsModule,
    NotificationsModule,
    MedicationsModule,
    StaffModule,
    forwardRef(() => OrdersModule),
    forwardRef(() => HospitalsModule),
  ],
  controllers: [PrescriptionsController],
  providers: [PrescriptionsService],
  exports: [PrescriptionsService],
})
export class PrescriptionsModule {}
