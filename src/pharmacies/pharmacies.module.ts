// backend/src/pharmacies/pharmacies.module.ts

import { Module } from '@nestjs/common';
import { PharmaciesService } from './pharmacies.service';
import { PharmaciesController } from './pharmacies.controller';
import { NotificationsModule } from '../notifications/notifications.module';
import { OrdersModule } from 'src/orders/orders.module';

@Module({
  imports: [NotificationsModule], // Import to use EmailService
  controllers: [PharmaciesController],
  providers: [PharmaciesService],
  exports: [PharmaciesService],
})
export class PharmaciesModule {}
