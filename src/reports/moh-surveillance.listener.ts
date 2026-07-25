import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { isStatutoryDisease, getDiseaseCategory } from './constants/icd10-statutory.constant';

@Injectable()
export class MohSurveillanceListener {
  private readonly logger = new Logger(MohSurveillanceListener.name);

  constructor(private readonly prisma: PrismaService) {}

  @OnEvent('diagnostic.completed', { async: true })
  async handleDiagnosticCompletedEvent(payload: { orderId: string }) {
    try {
      // 1. Fetch the diagnostic order to inspect the ICD-10 code
      const order = await this.prisma.diagnosticOrder.findUnique({
        where: { id: payload.orderId },
        select: { id: true, icd10Code: true, patientId: true },
      });

      if (!order || !order.icd10Code) {
        return;
      }

      // 2. Check if the code flags a statutory infectious disease
      if (isStatutoryDisease(order.icd10Code)) {
        const diseaseCategory = getDiseaseCategory(order.icd10Code);
        
        // 3. Log it to the surveillance table using upsert to prevent duplicates 
        // in case the diagnostic is updated and the event fires again
        await this.prisma.mohSurveillanceLog.upsert({
          where: { diagnosticOrderId: order.id },
          update: {}, 
          create: {
            patientId: order.patientId,
            diagnosticOrderId: order.id,
            icd10Code: order.icd10Code,
            diseaseCategory: diseaseCategory!,
          },
        });
        
        this.logger.log(`MOH Statutory Disease Logged: [${diseaseCategory}] for order ${order.id}`);
      }
    } catch (error) {
      this.logger.error(
        `Failed to process MOH surveillance for order ${payload.orderId}: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }
}