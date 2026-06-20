import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Cron, CronExpression } from '@nestjs/schedule';

@Injectable()
export class InpatientBillingService {
  private readonly logger = new Logger(InpatientBillingService.name);

  constructor(private readonly prisma: PrismaService) {}

  // 1. Daily Cron Job to run at midnight
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async handleDailyWardCharges() {
    this.logger.log('Running daily ward charge aggregation...');

    // Find all active admissions
    const activeAdmissions = await this.prisma.admission.findMany({
      where: { status: 'ACTIVE' },
      include: {
        bed: { include: { ward: true } },
        hospitalInvoice: true,
      },
    });

    for (const admission of activeAdmissions) {
      try {
        const bedCharge = admission.bed.ward.baseBedCharge;
        
        let invoice = admission.hospitalInvoice;

        // If no invoice exists, create one
        if (!invoice) {
          invoice = await this.prisma.hospitalInvoice.create({
            data: {
              admissionId: admission.id,
              patientId: admission.patientId,
              hospitalId: admission.hospitalId,
              totalAmount: 0,
            },
          });
        }

        // Create the invoice item for today's bed charge
        await this.prisma.hospitalInvoiceItem.create({
          data: {
            invoiceId: invoice.id,
            description: `Daily Bed Charge - ${admission.bed.ward.name} (${admission.bed.number})`,
            quantity: 1,
            unitCost: bedCharge,
            subtotal: bedCharge,
            category: 'BED_FEE',
          },
        });

        // Update the total invoice amount
        await this.prisma.hospitalInvoice.update({
          where: { id: invoice.id },
          data: {
            totalAmount: { increment: bedCharge },
          },
        });

        this.logger.log(`Charged bed fee for admission: ${admission.id}`);
      } catch (error: any) {
        this.logger.error(`Failed to charge bed fee for admission ${admission.id}: ${error.message}`);
      }
    }
    this.logger.log('Finished daily ward charge aggregation.');
  }

  // 2. Log bedside supply consumption
  async logSupplyConsumption(admissionId: string, data: any, staffId: string) {
    const admission = await this.prisma.admission.findUnique({
      where: { id: admissionId },
      include: { hospitalInvoice: true },
    });

    if (!admission) throw new NotFoundException('Admission not found');

    const totalCost = Number(data.quantity) * Number(data.unitCost);

    // Record the consumption
    await this.prisma.supplyConsumption.create({
      data: {
        admissionId,
        itemName: data.itemName,
        category: data.category,
        quantity: data.quantity,
        unitCost: data.unitCost,
        totalCost: totalCost,
        administeredBy: staffId,
      },
    });

    let invoice = admission.hospitalInvoice;
    if (!invoice) {
      invoice = await this.prisma.hospitalInvoice.create({
        data: {
          admissionId: admission.id,
          patientId: admission.patientId,
          hospitalId: admission.hospitalId,
          totalAmount: 0,
        },
      });
    }

    // Immediately append it to the checkout invoice
    await this.prisma.hospitalInvoiceItem.create({
      data: {
        invoiceId: invoice.id,
        description: `Supply: ${data.itemName}`,
        quantity: data.quantity,
        unitCost: data.unitCost,
        subtotal: totalCost,
        category: data.category || 'SUPPLIES',
      },
    });

    // Update total amount
    await this.prisma.hospitalInvoice.update({
      where: { id: invoice.id },
      data: { totalAmount: { increment: totalCost } },
    });

    return { message: 'Supply consumption logged and invoice updated' };
  }

  // 3. Compile checkout invoice by department
  async getCheckoutInvoice(admissionId: string) {
    const invoice = await this.prisma.hospitalInvoice.findUnique({
      where: { admissionId },
      include: { items: true },
    });

    if (!invoice) throw new NotFoundException('Invoice not found for this admission');

    // Group items by category (department)
    const groupedItems = invoice.items.reduce((acc: any, item: any) => {
      const category = item.category || 'OTHER';
      if (!acc[category]) acc[category] = [];
      acc[category].push(item);
      return acc;
    }, {});

    return {
      invoiceId: invoice.id,
      totalAmount: invoice.totalAmount,
      paymentStatus: invoice.paymentStatus,
      departments: groupedItems,
    };
  }
}
