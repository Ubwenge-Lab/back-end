import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AdmissionStatus, HospitalBillingStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LogSupplyDto } from './dto/log-supply.dto';

@Injectable()
export class InpatientBillingService {
  private readonly logger = new Logger(InpatientBillingService.name);

  constructor(private readonly prisma: PrismaService) {}

  private async resolveHospitalId(userId: string, role: string) {
    if (role === 'DOCTOR') {
      const doctor = await this.prisma.doctor.findFirst({
        where: { userId },
        select: { hospitalId: true },
      });
      if (!doctor) throw new ForbiddenException('Doctor profile not found');
      return doctor.hospitalId;
    }

    if (role === 'HOSPITAL_ADMIN') {
      const hospital = await this.prisma.hospital.findFirst({
        where: { userId },
        select: { id: true },
      });
      if (!hospital) throw new ForbiddenException('Hospital profile not found');
      return hospital.id;
    }

    const staff = await this.prisma.hospitalStaff.findFirst({
      where: { userId },
      select: { hospitalId: true },
    });
    if (!staff) {
      throw new ForbiddenException('You are not registered as hospital staff');
    }
    return staff.hospitalId;
  }

  private assertSameHospital(
    actorHospitalId: string,
    admissionHospitalId: string,
  ) {
    if (actorHospitalId !== admissionHospitalId) {
      throw new ForbiddenException('Access denied to this admission');
    }
  }

  private getWardChargeServiceDate() {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Africa/Kigali',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
  }

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async handleDailyWardCharges() {
    this.logger.log('Running daily ward charge aggregation...');

    const activeAdmissions = await this.prisma.inpatientAdmission.findMany({
      where: { status: AdmissionStatus.ACTIVE },
      select: { id: true },
    });

    for (const candidate of activeAdmissions) {
      try {
        const charged = await this.prisma.$transaction(async (tx) => {
          await tx.$queryRaw`
            SELECT id
            FROM inpatient_admissions
            WHERE id = ${candidate.id}
            FOR UPDATE
          `;

          const admission = await tx.inpatientAdmission.findUnique({
            where: { id: candidate.id },
            include: {
              bed: { include: { ward: true } },
              hospitalInvoice: true,
            },
          });
          if (!admission || admission.status !== AdmissionStatus.ACTIVE) {
            return false;
          }
          if (!admission.bed) {
            this.logger.warn(
              `Admission ${admission.id} has no associated bed. Skipping bed charge.`,
            );
            return false;
          }
          if (
            admission.hospitalInvoice?.paymentStatus ===
            HospitalBillingStatus.PAID
          ) {
            this.logger.warn(
              `Admission ${admission.id} has a paid invoice. Skipping bed charge.`,
            );
            return false;
          }

          const bedCharge = admission.bed.ward.baseBedCharge;
          const invoice =
            admission.hospitalInvoice ??
            (await tx.hospitalInvoice.create({
              data: {
                admissionId: admission.id,
                patientId: admission.patientId,
                hospitalId: admission.hospitalId,
                totalAmount: 0,
              },
            }));

          const description = `Daily Bed Charge ${this.getWardChargeServiceDate()} - ${admission.bed.ward.name} (${admission.bed.number})`;
          const existingCharge = await tx.hospitalInvoiceItem.findFirst({
            where: {
              invoiceId: invoice.id,
              category: 'BED_FEE',
              description,
            },
            select: { id: true },
          });
          if (existingCharge) {
            return false;
          }

          await tx.hospitalInvoiceItem.create({
            data: {
              invoiceId: invoice.id,
              description,
              quantity: 1,
              unitCost: bedCharge,
              subtotal: bedCharge,
              category: 'BED_FEE',
            },
          });
          await tx.hospitalInvoice.update({
            where: { id: invoice.id },
            data: { totalAmount: { increment: bedCharge } },
          });
          return true;
        });

        if (charged) {
          this.logger.log(`Charged bed fee for admission: ${candidate.id}`);
        }
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : 'Unknown billing error';
        this.logger.error(
          `Failed to charge bed fee for admission ${candidate.id}: ${message}`,
        );
      }
    }

    this.logger.log('Finished daily ward charge aggregation.');
  }

  async logSupplyConsumption(
    admissionId: string,
    data: LogSupplyDto,
    userId: string,
    role: string,
  ) {
    const actorHospitalId = await this.resolveHospitalId(userId, role);
    const totalCost = Number(data.quantity) * Number(data.unitCost);
    const category = data.category ?? 'SUPPLIES';

    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`
        SELECT id
        FROM inpatient_admissions
        WHERE id = ${admissionId}
        FOR UPDATE
      `;
      const admission = await tx.inpatientAdmission.findUnique({
        where: { id: admissionId },
        include: { hospitalInvoice: true },
      });
      if (!admission) throw new NotFoundException('Admission not found');
      this.assertSameHospital(actorHospitalId, admission.hospitalId);
      if (admission.status !== AdmissionStatus.ACTIVE) {
        throw new ConflictException(
          'Cannot add inpatient charges after discharge',
        );
      }
      if (
        admission.hospitalInvoice?.paymentStatus === HospitalBillingStatus.PAID
      ) {
        throw new ConflictException('Cannot add charges to a paid invoice');
      }

      await tx.supplyConsumption.create({
        data: {
          admissionId,
          itemName: data.itemName,
          category,
          quantity: data.quantity,
          unitCost: data.unitCost,
          totalCost,
          administeredBy: userId,
        },
      });

      const invoice =
        admission.hospitalInvoice ??
        (await tx.hospitalInvoice.create({
          data: {
            admissionId: admission.id,
            patientId: admission.patientId,
            hospitalId: admission.hospitalId,
            totalAmount: 0,
          },
        }));

      await tx.hospitalInvoiceItem.create({
        data: {
          invoiceId: invoice.id,
          description: `Supply: ${data.itemName}`,
          quantity: data.quantity,
          unitCost: data.unitCost,
          subtotal: totalCost,
          category,
        },
      });
      await tx.hospitalInvoice.update({
        where: { id: invoice.id },
        data: { totalAmount: { increment: totalCost } },
      });

      return { message: 'Supply consumption logged and invoice updated' };
    });
  }

  async getCheckoutInvoice(admissionId: string, userId: string, role: string) {
    const actorHospitalId = await this.resolveHospitalId(userId, role);
    const admission = await this.prisma.inpatientAdmission.findUnique({
      where: { id: admissionId },
      select: { hospitalId: true },
    });
    if (!admission) throw new NotFoundException('Admission not found');
    this.assertSameHospital(actorHospitalId, admission.hospitalId);

    const invoice = await this.prisma.hospitalInvoice.findUnique({
      where: { admissionId },
      include: { items: true },
    });
    if (!invoice) {
      throw new NotFoundException('Invoice not found for this admission');
    }

    const departments = invoice.items.reduce<
      Record<string, typeof invoice.items>
    >((grouped, item) => {
      const category = item.category ?? 'OTHER';
      (grouped[category] ??= []).push(item);
      return grouped;
    }, {});

    return {
      invoiceId: invoice.id,
      totalAmount: invoice.totalAmount,
      paymentStatus: invoice.paymentStatus,
      departments,
    };
  }
}
