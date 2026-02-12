// backend/src/payments/payments.module.ts

import { forwardRef, Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { PaymentsService } from './payments.service';
import { FlutterwaveService } from './flutterwave.service';
import { PaymentsController } from './payments.controller';
import { OrdersModule } from '../orders/orders.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [HttpModule, NotificationsModule, forwardRef(() => OrdersModule)],
  controllers: [PaymentsController],
  providers: [PaymentsService, FlutterwaveService],
  exports: [PaymentsService, FlutterwaveService],
})
export class PaymentsModule {}
