import { Module } from '@nestjs/common';
import { HospitalsController } from './hospitals.controller';
import { HospitalsService } from './hospitals.service';
import { PrismaModule } from '../prisma/prisma.module';
import { InvoicesModule } from '../invoices/invoices.module';
import { FlutterwaveService } from '../payments/flutterwave.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [PrismaModule, InvoicesModule, NotificationsModule],
  controllers: [HospitalsController],
  providers: [HospitalsService, FlutterwaveService],
  exports: [HospitalsService],
})
export class HospitalsModule {}
