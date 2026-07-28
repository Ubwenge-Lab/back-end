import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { ClaimStatus } from '@prisma/client';
import { APP_EVENTS } from '../common/constants/events.constant';

const MOCK_ICD10_CODES = ['J00', 'R50.9', 'I10'];

@Injectable()
export class InsuranceDispatchService {
  private readonly logger = new Logger(InsuranceDispatchService.name);

  constructor(private readonly prisma: PrismaService) {}

  @OnEvent(APP_EVENTS.INVOICE_CREATED)
  async handleInvoiceCreatedEvent(payload: { invoiceId: string }) {
    this.logger.log(`Dispatch Simulator started for invoice ${payload.invoiceId}`);
    
    const invoice = await this.prisma.hospitalInvoice.findUnique({
      where: { id: payload.invoiceId },
      include: {
        patient: true,
        items: true,
      },
    });

    if (!invoice || !invoice.insuranceCovered || !invoice.patient.insuranceProvider) {
      this.logger.log(`Invoice ${payload.invoiceId} is not covered by insurance. Skipping claim dispatch.`);
      return;
    }

    // Check if claim already exists
    const existingClaim = await this.prisma.insuranceClaim.findUnique({
      where: { invoiceId: invoice.id },
    });
    if (existingClaim) {
      this.logger.warn(`Claim already exists for invoice ${invoice.id}. Skipping.`);
      return;
    }

    // Mock ICD-10 encoding and serialization for dispatch
    const serializedPayload = {
      hospitalId: invoice.hospitalId,
      patientMemberId: invoice.patient.insuranceMemberId,
      patientName: `${invoice.patient.firstName} ${invoice.patient.lastName}`,
      icd10Codes: MOCK_ICD10_CODES, // Mock diagnostic codes for simulator
      items: invoice.items.map(item => ({
        description: item.description,
        quantity: item.quantity,
        unitCost: Number(item.unitCost),
      })),
      totalBilled: Number(invoice.totalAmount),
    };

    this.logger.debug(`Serialized Claim Payload to ${invoice.patient.insuranceProvider}: ${JSON.stringify(serializedPayload)}`);

    // Calculate claim amount based on patient's specific coverage percentage
    const coveragePercentage = invoice.patient.insuranceCoverage || 0;
    const claimAmount = (Number(invoice.totalAmount) * coveragePercentage) / 100;

    // Save InsuranceClaim record representing the submission
    await this.prisma.insuranceClaim.create({
      data: {
        invoiceId: invoice.id,
        provider: invoice.patient.insuranceProvider,
        claimAmount,
        status: ClaimStatus.PENDING, // Mocking an immediate successful submission to the mock endpoint
      },
    });

    this.logger.log(`InsuranceClaim successfully generated and submitted to ${invoice.patient.insuranceProvider} for ${claimAmount} RWF.`);
  }
}
