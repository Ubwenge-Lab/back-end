import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class InventoryService {
  private readonly logger = new Logger(InventoryService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Adjusts the consumable stock manually if physical shelf inventory differs.
   */
  async adjustStockManually(stockId: string, newQuantity: number, reason: string) {
    this.logger.log(`Manual adjustment for stock ${stockId}: ${newQuantity}. Reason: ${reason}`);
    const stock = await this.prisma.hospitalConsumableStock.findUnique({
      where: { id: stockId },
    });
    
    if (!stock) {
      throw new NotFoundException(`Stock item with ID ${stockId} not found`);
    }

    return this.prisma.hospitalConsumableStock.update({
      where: { id: stockId },
      data: { quantity: newQuantity },
    });
  }

  /**
   * Intercepts diagnostic completion and deducts consumables from inventory
   */
  async deductConsumablesForDiagnostic(diagnosticOrderId: string) {
    const order = await this.prisma.diagnosticOrder.findUnique({
      where: { id: diagnosticOrderId },
    });

    if (!order) {
      throw new NotFoundException(`Diagnostic Order ${diagnosticOrderId} not found`);
    }

    if (order.inventoryDeducted) {
      this.logger.warn(`Inventory already deducted for diagnostic order ${diagnosticOrderId}`);
      return;
    }

    // Determine hospital from the doctor attached to the order
    const doctor = await this.prisma.doctor.findUnique({
      where: { id: order.doctorId },
      include: { hospital: true },
    });

    if (!doctor || !doctor.hospital) {
      this.logger.warn(`Could not determine hospital for diagnostic order ${diagnosticOrderId}`);
      return;
    }

    const hospitalId = doctor.hospital.id;

    // Fetch the BOM mapping for this diagnostic type
    const boms = await this.prisma.diagnosticConsumableBOM.findMany({
      where: { diagnosticType: order.testType },
      include: { consumable: true },
    });

    if (boms.length === 0) {
      this.logger.log(`No consumable BOM found for test type ${order.testType}. Skipping deduction.`);
      return;
    }

    // Execute in a transaction
    await this.prisma.$transaction(async (prisma) => {
      for (const bom of boms) {
        // Find the specific consumable for this hospital
        const stock = await prisma.hospitalConsumableStock.findUnique({
          where: {
            hospitalId_itemName: {
              hospitalId,
              itemName: bom.consumable.itemName,
            },
          },
        });

        if (!stock) {
          this.logger.warn(`Consumable stock for ${bom.consumable.itemName} not found in hospital ${hospitalId}. Cannot deduct.`);
          continue; // Instead of throwing, we might just warn. Or we could throw if strict inventory is needed.
        }

        const newQuantity = stock.quantity - bom.quantityUsed;

        if (newQuantity < 0) {
          throw new BadRequestException(`Negative stock alert: Insufficient stock for ${stock.itemName}. Current: ${stock.quantity}, Required: ${bom.quantityUsed}`);
        }

        if (newQuantity <= stock.criticalThreshold) {
          this.logger.warn(`CRITICAL THRESHOLD ALERT: Stock for ${stock.itemName} dropped to ${newQuantity}`);
        }

        await prisma.hospitalConsumableStock.update({
          where: { id: stock.id },
          data: { quantity: newQuantity },
        });
      }

      // Mark the diagnostic order as deducted
      await prisma.diagnosticOrder.update({
        where: { id: order.id },
        data: { inventoryDeducted: true },
      });
    });

    this.logger.log(`Successfully deducted inventory for diagnostic order ${diagnosticOrderId}`);
  }
}
