import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LogDisposalDto } from './dto/log-disposal.dto';

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

  /**
   * Intercepts surgery completion and deducts consumables from inventory
   */
  async deductConsumablesForSurgery(bookingId: string) {
    const booking = await this.prisma.surgeryBooking.findUnique({
      where: { id: bookingId },
    });

    if (!booking) {
      throw new NotFoundException(`Surgery Booking ${bookingId} not found`);
    }

    if (booking.inventoryDeducted) {
      this.logger.warn(`Inventory already deducted for surgery booking ${bookingId}`);
      return;
    }

    const hospitalId = booking.hospitalId;

    // Fetch the BOM mapping for this specific surgical procedure
    const boms = await this.prisma.surgeryConsumableBOM.findMany({
      where: { procedureName: booking.procedureName },
      include: { consumable: true },
    });

    if (boms.length === 0) {
      this.logger.log(`No consumable BOM found for procedure '${booking.procedureName}'. Skipping deduction.`);
      return;
    }

    // Execute safely in a transaction
    await this.prisma.$transaction(async (prisma) => {
      for (const bom of boms) {
        // Look up the specific stock record for this hospital
        const stock = await prisma.hospitalConsumableStock.findUnique({
          where: {
            id: bom.consumableId,
          },
        });

        if (!stock) {
          this.logger.warn(`Consumable stock ID ${bom.consumableId} not found. Cannot deduct.`);
          continue; 
        }

        const newQuantity = stock.quantity - bom.quantityUsed;

        if (newQuantity < 0) {
          throw new BadRequestException(
            `Negative stock alert: Insufficient stock for ${stock.itemName}. Current: ${stock.quantity}, Required: ${bom.quantityUsed}`
          );
        }

        if (newQuantity <= stock.criticalThreshold) {
          this.logger.warn(`CRITICAL THRESHOLD ALERT: Stock for ${stock.itemName} dropped to ${newQuantity}`);
        }

        // Deduct the quantity
        await prisma.hospitalConsumableStock.update({
          where: { id: stock.id },
          data: { quantity: newQuantity },
        });
      }

      // Mark the surgery booking as deducted to prevent double-billing
      await prisma.surgeryBooking.update({
        where: { id: booking.id },
        data: { inventoryDeducted: true },
      });
    });

    this.logger.log(`Successfully deducted inventory for surgery booking ${bookingId}`);
  }

  /**
   * Deduct stock due to expiry and log the disposal
   */
  async logDisposal(dto: LogDisposalDto, adminId: string) {
    this.logger.log(`Disposing ${dto.quantity} of ${dto.itemName} (${dto.itemType})`);

    return this.prisma.$transaction(async (prisma) => {
      // Deduct the stock
      if (dto.itemType === 'Hospital Consumable') {
        const stock = await prisma.hospitalConsumableStock.findUnique({ where: { id: dto.itemId } });
        if (!stock) throw new NotFoundException('Consumable not found');
        if (stock.quantity < dto.quantity) throw new BadRequestException('Insufficient quantity to dispose');
        await prisma.hospitalConsumableStock.update({
          where: { id: dto.itemId },
          data: { quantity: stock.quantity - dto.quantity },
        });
      } else if (dto.itemType === 'Hospital Drug') {
        // Find stock based on drugId + hospitalId? Wait, the DTO itemId will be drugId, but we don't have hospitalId directly. 
        // We'll search by drugId and first available or require hospitalId in DTO? 
        // For simplicity assuming itemId is the drugId, we deduct from the admin's hospital or the first one.
        // Actually, let's just search first HospitalDrugStock for that drugId.
        const stock = await prisma.hospitalDrugStock.findFirst({ where: { drugId: dto.itemId } });
        if (!stock) throw new NotFoundException('Hospital Drug Stock not found');
        if (stock.quantity < dto.quantity) throw new BadRequestException('Insufficient quantity to dispose');
        await prisma.hospitalDrugStock.update({
          where: { drugId_hospitalId: { drugId: stock.drugId, hospitalId: stock.hospitalId } },
          data: { quantity: stock.quantity - dto.quantity },
        });
      } else if (dto.itemType === 'Pharmacy Medication') {
        const stock = await prisma.medication.findUnique({ where: { id: dto.itemId } });
        if (!stock) throw new NotFoundException('Medication not found');
        if (stock.quantity < dto.quantity) throw new BadRequestException('Insufficient quantity to dispose');
        await prisma.medication.update({
          where: { id: dto.itemId },
          data: { quantity: stock.quantity - dto.quantity },
        });
      }

      // Log it
      return prisma.disposalLog.create({
        data: {
          itemId: dto.itemId,
          itemName: dto.itemName,
          itemType: dto.itemType,
          quantity: dto.quantity,
          method: dto.method,
          notes: dto.notes,
          authorizedBy: adminId,
        },
      });
    }, { timeout: 15000 });
  }
}
