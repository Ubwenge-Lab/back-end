import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { HospitalBillingStatus } from '@prisma/client';
import { InvoicePaidEvent } from '../documents/invoice-paid.event';

@Injectable()
export class InvoicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  // ========================================
  // ADMIN LIST — paginated, filtered by hospital
  // ========================================

  async findByHospital(
    hospitalId: string,
    userId: string,
    role: string,
    filters: {
      status?: string;
      from?: string;
      to?: string;
      page?: number;
      limit?: number;
    },
  ) {
    if (role === 'HOSPITAL_ADMIN') {
      const hospital = await this.prisma.hospital.findFirst({
        where: { userId },
      });
      if (!hospital || hospital.id !== hospitalId) {
        throw new ForbiddenException('Access denied to this hospital');
      }
    } else if (role !== 'SUPER_ADMIN') {
      throw new ForbiddenException('Access denied');
    }

    const page = Math.max(1, filters.page ?? 1);
    const limit = Math.min(100, Math.max(1, filters.limit ?? 10));
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = { hospitalId };

    if (filters.status) {
      where.paymentStatus = filters.status as HospitalBillingStatus;
    }
    if (filters.from || filters.to) {
      where.issuedAt = {
        ...(filters.from && { gte: new Date(filters.from) }),
        ...(filters.to && { lte: new Date(filters.to) }),
      };
    }

    const [total, data] = await Promise.all([
      this.prisma.hospitalInvoice.count({ where }),
      this.prisma.hospitalInvoice.findMany({
        where,
        include: hospitalInvoiceInclude,
        orderBy: { issuedAt: 'desc' },
        skip,
        take: limit,
      }),
    ]);

    return {
      data,
      meta: { total, page, limit, pages: Math.ceil(total / limit) },
    };
  }

  // ========================================
  // SINGLE INVOICE — patient-accessible
  // ========================================

  async findOne(id: string, userId: string, role: string) {
    const invoice = await this.prisma.hospitalInvoice.findUnique({
      where: { id },
      include: hospitalInvoiceInclude,
    });
    if (!invoice) throw new NotFoundException('Invoice not found');

    if (
      role === 'SUPER_ADMIN' ||
      role === 'HOSPITAL_ADMIN' ||
      role === 'RECEPTIONIST'
    ) {
      return invoice;
    }

    if (role === 'PATIENT') {
      const patient = await this.prisma.patient.findUnique({
        where: { userId },
      });
      if (invoice.patientId !== patient?.id)
        throw new ForbiddenException('Access denied');
    }

    return invoice;
  }

  // ========================================
  // PAY — transition paymentStatus to PAID
  // ========================================

  async pay(id: string, userId: string, role: string) {
    let actorHospitalId: string | null = null;
    if (role === 'HOSPITAL_ADMIN') {
      const hospital = await this.prisma.hospital.findFirst({
        where: { userId },
      });
      if (!hospital) throw new ForbiddenException('Hospital not found');
      actorHospitalId = hospital.id;
    } else if (role === 'RECEPTIONIST') {
      const staff = await this.prisma.hospitalStaff.findFirst({
        where: { userId },
        select: { hospitalId: true },
      });
      if (!staff) throw new ForbiddenException('Hospital staff not found');
      actorHospitalId = staff.hospitalId;
    } else if (role !== 'SUPER_ADMIN') {
      throw new ForbiddenException('Access denied');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const invoiceScope = await tx.hospitalInvoice.findUnique({
        where: { id },
        select: { admissionId: true, hospitalId: true },
      });
      if (!invoiceScope) throw new NotFoundException('Invoice not found');
      if (actorHospitalId && invoiceScope.hospitalId !== actorHospitalId) {
        throw new ForbiddenException('Access denied');
      }

      // Inpatient charge writers lock the admission before touching its
      // invoice. Taking the same locks in the same order prevents payment from
      // racing a late supply or nightly bed charge.
      if (invoiceScope.admissionId) {
        await tx.$queryRaw`
          SELECT id
          FROM inpatient_admissions
          WHERE id = ${invoiceScope.admissionId}
          FOR UPDATE
        `;
      }
      await tx.$queryRaw`
        SELECT id
        FROM hospital_invoices
        WHERE id = ${id}
        FOR UPDATE
      `;

      const invoice = await tx.hospitalInvoice.findUnique({ where: { id } });
      if (!invoice) throw new NotFoundException('Invoice not found');

      if (invoice.paymentStatus === HospitalBillingStatus.PAID) {
        throw new BadRequestException('Invoice is already paid');
      }

      return tx.hospitalInvoice.update({
        where: { id },
        data: { paymentStatus: HospitalBillingStatus.PAID },
        include: hospitalInvoiceInclude,
      });
    });

    // Fetch email separately so the Serializable-free transaction above
    // never has to JOIN through Patient (a clinical model with async audit hooks).
    const patientUser = await this.prisma.patient.findUnique({
      where: { id: updated.patientId },
      select: { user: { select: { email: true } } },
    });
    const patientEmail = patientUser?.user?.email;

    if (patientEmail) {
      this.eventEmitter.emit(
        'invoice.paid',
        new InvoicePaidEvent(
          updated.id,
          patientEmail,
          `${updated.patient.firstName} ${updated.patient.lastName}`,
        ),
      );
    }

    return { message: 'Invoice marked as PAID.', invoice: updated };
  }
}

const hospitalInvoiceInclude = {
  items: true,
  patient: { select: { firstName: true, lastName: true, phone: true } },
  hospital: { select: { id: true, name: true, address: true } },
  appointment: { select: { date: true, reason: true } },
};
