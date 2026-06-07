// backend/src/pharmacies/pharmacies.module.ts

import { Module, forwardRef } from '@nestjs/common';
import { PharmaciesService } from './pharmacies.service';
import { PharmaciesController } from './pharmacies.controller';
import { NotificationsModule } from '../notifications/notifications.module';
import { OrdersModule } from 'src/orders/orders.module';
import { TriangulationModule } from '../triangulation/triangulation.module';
import { PrescriptionsModule } from '../prescriptions/prescriptions.module';

@Module({
  imports: [
    NotificationsModule,
    TriangulationModule,
    forwardRef(() => PrescriptionsModule),
  ], // Import to use EmailService and TriangulationService
  controllers: [PharmaciesController],
  providers: [PharmaciesService],
  exports: [PharmaciesService],
})
export class PharmaciesModule {}
