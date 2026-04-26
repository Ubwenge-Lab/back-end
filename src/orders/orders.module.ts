// backend/src/orders/orders.module.ts

import { Module } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';
import { PatientsModule } from '../patients/patients.module';
import { PharmaciesModule } from '../pharmacies/pharmacies.module';
import { MedicationsModule } from '../medications/medications.module';
import { PrescriptionsModule } from '../prescriptions/prescriptions.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PaymentsModule } from '../payments/payments.module';
import { StaffModule } from '../staff/staff.module';

@Module({
  imports: [
    PatientsModule,
    PharmaciesModule,
    MedicationsModule,
    PrescriptionsModule,
    NotificationsModule,
    PaymentsModule,
    StaffModule,
  ],
  controllers: [OrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
