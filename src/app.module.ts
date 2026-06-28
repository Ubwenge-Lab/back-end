// backend/src/app.module.ts
// UPDATED VERSION - Added StaffModule + Logging Pipeline + Rate Limiting

import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { APP_INTERCEPTOR, APP_GUARD } from '@nestjs/core';
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
import { AvailabilityModule } from './doctors/availability/availability.module';
import { DocumentsModule } from './documents/documents.module';
import { ClaimsModule } from './claims/claims.module';
import {
  LoggerModule,
  CorrelationIdMiddleware,
  LoggingInterceptor,
} from './logger';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { ReportsModule } from './reports/reports.module';
import { PlatformBillingModule } from './platform-billing/platform-billing.module';
import { InpatientModule } from './inpatient/inpatient.module';
import { DiagnosticsModule } from './diagnostics/diagnostics.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    // configure rate limiting: max 100 requests every 60,000 ms (1 minute) per IP
    ThrottlerModule.forRoot([
      {
        ttl: 60000, // 1 minute
        limit: 100, // max 100 requests per IP per ttl
      },
    ]),

    EventEmitterModule.forRoot(),
    ScheduleModule.forRoot(),
    LoggerModule,
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
    AvailabilityModule, // NEW
    ReportsModule,
    DocumentsModule,
    ClaimsModule,
    PlatformBillingModule,
    InpatientModule,
    DiagnosticsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // Bind TrhrottlerGuard globally to apply rate limiting to all routes
    {
      provide: APP_INTERCEPTOR,
      useClass: LoggingInterceptor,
    },
    // Bind ThrottlerGuard globally to apply rate limiting to all routes
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(CorrelationIdMiddleware).forRoutes('*');
  }
}
