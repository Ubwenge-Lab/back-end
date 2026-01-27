// backend/src/app.module.ts

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { PatientsModule } from './patients/patients.module';
import { PharmaciesModule } from './pharmacies/pharmacies.module';
import { MedicationsModule } from './medications/medications.module';
import { OrdersModule } from './orders/orders.module';
import { PrescriptionsModule } from './prescriptions/prescriptions.module';
import { PaymentsModule } from './payments/payments.module';
import { InsuranceModule } from './insurance/insurance.module';
import { NotificationsModule } from './notifications/notifications.module';
import { SuperAdminModule } from './super-admin/super-admin.module';
import { UploadModule } from './upload/upload.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    PrismaModule,
    AuthModule,
    UsersModule,
    PatientsModule,
    PharmaciesModule,
    MedicationsModule,
    OrdersModule,
    PrescriptionsModule,
    PaymentsModule,
    InsuranceModule,
    NotificationsModule,
    SuperAdminModule,
    UploadModule,
  ],
})
export class AppModule {}