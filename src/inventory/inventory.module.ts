import { Module } from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { InventoryController } from './inventory.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { InventoryListener } from './inventory.listener';
import { NotificationsModule } from '../notifications/notifications.module';
import { InventoryScheduler } from './inventory.scheduler';
import { InventoryCronService } from './inventory-cron.service';

@Module({
  imports: [PrismaModule, NotificationsModule],
  providers: [InventoryService, InventoryListener, InventoryScheduler, InventoryCronService],
  controllers: [InventoryController],
  exports: [InventoryService, InventoryCronService],
})
export class InventoryModule {}
