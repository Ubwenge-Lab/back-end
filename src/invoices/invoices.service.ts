import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { HospitalBillingStatus } from '@prisma/client';

@Injectable()
export class InvoicesService {
  constructor(private readonly prisma: PrismaService) {}

  // ========================================
  // ADMIN LIST — paginated, filtered by hospital
  // ========================================

  async findByHospital(
    hospitalId: string,
    userId: string,
    role: string,
    filters: { status?: string; from?: string; to?: string; page?: number; limit?: number },
  ) {
    if (role === 'HOSPITAL_ADMIN') {
      const hospital = await this.prisma.hospital.findFirst({ where: { userId } });
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

    if (role === 'SUPER_ADMIN' || role === 'HOSPITAL_ADMIN' || role === 'RECEPTIONIST') {
      return invoice;
    }

    if (role === 'PATIENT') {
      const patient = await this.prisma.patient.findUnique({ where: { userId } });
      if (invoice.patientId !== patient?.id) throw new ForbiddenException('Access denied');
    }

    return invoice;
  }

  // ========================================
  // PAY — transition paymentStatus to PAID
  // ========================================

  async pay(id: string, userId: string, role: string) {
    const invoice = await this.prisma.hospitalInvoice.findUnique({ where: { id } });
    if (!invoice) throw new NotFoundException('Invoice not found');

    if (invoice.paymentStatus === HospitalBillingStatus.PAID) {
      throw new BadRequestException('Invoice is already paid');
    }

    if (role === 'HOSPITAL_ADMIN' || role === 'RECEPTIONIST') {
      const hospital = await this.prisma.hospital.findFirst({ where: { userId } });
      if (!hospital) throw new ForbiddenException('Hospital not found');

      if (role === 'HOSPITAL_ADMIN' && invoice.hospitalId !== hospital.id) {
        throw new ForbiddenException('Access denied');
      }
    }

    const updated = await this.prisma.hospitalInvoice.update({
      where: { id },
      data: { paymentStatus: HospitalBillingStatus.PAID },
      include: hospitalInvoiceInclude,
    });

    return { message: 'Invoice marked as PAID.', invoice: updated };
  }
}

const hospitalInvoiceInclude = {
  items: true,
  patient: { select: { firstName: true, lastName: true, phone: true } },
  hospital: { select: { id: true, name: true, address: true } },
  appointment: { select: { date: true, reason: true } },
};
