import { Module } from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { InventoryController } from './inventory.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { InventoryListener } from './inventory.listener';

@Module({
  imports: [PrismaModule],
  providers: [InventoryService, InventoryListener],
  controllers: [InventoryController],
  exports: [InventoryService],
})
export class InventoryModule {}
