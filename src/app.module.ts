// backend/src/app.module.ts
// UPDATED VERSION - Added StaffModule

import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
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
import { BranchesModule } from './branches/branches.module';
import { StaffModule } from './staff/staff.module'; // NEW
import { AttendanceModule } from './attendance/attendance.module';
import { StockTransfersModule } from './stock-transfers/stock-transfers.module';
import { TriangulationModule } from './triangulation/triangulation.module';
import { LocationModule } from './location/location.module';
import { InvoicesModule } from './invoices/invoices.module';
import { SupportModule } from './support/support.module';
import { HospitalsModule } from './hospitals/hospitals.module';
import { AppointmentsModule } from './appointments/appointments.module';
import { DoctorsModule } from './doctors/doctors.module';

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
    BranchesModule,
    StaffModule, // NEW
    AttendanceModule,
    StockTransfersModule,
    TriangulationModule,
    LocationModule,
    InvoicesModule,
    SupportModule,
    HospitalsModule,
    AppointmentsModule,
    DoctorsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
