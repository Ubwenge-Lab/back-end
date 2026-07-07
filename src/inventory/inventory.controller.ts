import { 
  Controller, 
  Patch, 
  Param, 
  Body, 
  UseGuards, 
  ParseUUIDPipe 
} from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { AdjustStockDto } from './dto/adjust-stock.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '@prisma/client';

@Controller('inventory')
@UseGuards(JwtAuthGuard, RolesGuard)
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Patch('consumables/:id/adjust')
  @Roles(
    UserRole.HOSPITAL_ADMIN as any,
    UserRole.PHARMACY as any,
    UserRole.PHARMACIST as any,
  )
  async adjustConsumableStock(
    @Param('id', ParseUUIDPipe) stockId: string,
    @Body() adjustStockDto: AdjustStockDto,
  ) {
    return this.inventoryService.adjustStockManually(
      stockId,
      adjustStockDto.newQuantity,
      adjustStockDto.reason,
    );
  }
}