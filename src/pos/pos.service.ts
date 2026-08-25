// backend/src/pos/pos.service.ts

import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePosSaleDto } from './dto/create-pos-sale.dto';
import { StaffService } from '../staff/staff.service';
import { AuditService } from '../audit/audit.service';
import { ConfigService } from '@nestjs/config';

type Tx = Prisma.TransactionClient;

@Injectable()
export class PosService {
  constructor(
    private prisma: PrismaService,
    private staffService: StaffService,
    private auditService: AuditService,
    private configService: ConfigService,
  ) {}

  // ──────────────────────────────────────────
  // Resolve the branch for a staff member (staff record or branch manager)
  // ──────────────────────────────────────────
  private async resolveBranchId(staffUserId: string): Promise<string> {
    const staff = await this.staffService
      .findByUserId(staffUserId)
      .catch(() => null);
    const branchManager = await this.prisma.branch.findFirst({
      where: { managerId: staffUserId },
    });

    const branchId = staff?.branchId ?? branchManager?.id;
    if (!branchId) {
      throw new ForbiddenException('Staff member is not assigned to a branch');
    }
    return branchId;
  }

  // ──────────────────────────────────────────
  // Process a walk-in POS sale
  // ──────────────────────────────────────────
  async createSale(staffUserId: string, dto: CreatePosSaleDto) {
    const branchId = await this.resolveBranchId(staffUserId);

    // Optional: validate prescription if supplied
    if (dto.prescriptionId) {
      const rx = await this.prisma.prescription.findUnique({
        where: { id: dto.prescriptionId },
      });
      if (!rx) throw new NotFoundException('Prescription not found');
      if (rx.status !== 'APPROVED') {
        throw new BadRequestException(
          'Prescription must be APPROVED before use in a POS sale',
        );
      }
    }

    // Process inside a transaction: check stock, deduct atomically, create sale
    const sale = await this.prisma.$transaction(async (tx: Tx) => {
      let subtotal = new Prisma.Decimal(0);
      const saleItems: {
        medicationId: string;
        name: string;
        quantity: number;
        unitPrice: Prisma.Decimal;
        total: Prisma.Decimal;
      }[] = [];

      for (const item of dto.items) {
        const med = await tx.medication.findFirst({
          where: { id: item.medicationId, branchId },
        });
        if (!med) {
          throw new NotFoundException(
            `Medication ${item.medicationId} not found in this branch`,
          );
        }

        // ATOMIC stock deduction — the update only succeeds if enough stock remains,
        // which prevents concurrent checkouts from overselling into negative stock.
        const deducted = await tx.medication.updateMany({
          where: { id: med.id, branchId, quantity: { gte: item.quantity } },
          data: { quantity: { decrement: item.quantity } },
        });
        if (deducted.count === 0) {
          const current = await tx.medication.findUnique({
            where: { id: med.id },
            select: { quantity: true },
          });
          throw new BadRequestException(
            `Insufficient stock for "${med.name}". Available: ${current?.quantity ?? 0}`,
          );
        }

        const unitPrice = new Prisma.Decimal(med.price);
        const lineTotal = unitPrice.mul(item.quantity);
        subtotal = subtotal.add(lineTotal);

        saleItems.push({
          medicationId: med.id,
          name: med.name,
          quantity: item.quantity,
          unitPrice,
          total: lineTotal,
        });
      }

      const discount = new Prisma.Decimal(dto.discount ?? 0);
      const total = Prisma.Decimal.max(
        subtotal.sub(discount),
        new Prisma.Decimal(0),
      );
      const amountReceived = new Prisma.Decimal(dto.amountReceived);
      const change = Prisma.Decimal.max(
        amountReceived.sub(total),
        new Prisma.Decimal(0),
      );

      if (amountReceived.lt(total)) {
        throw new BadRequestException(
          `Amount received (${amountReceived}) is less than total (${total})`,
        );
      }

      // Generate a readable sale number: POS-YYYYMMDD-XXXX (retry on unique collision)
      const today = new Date();
      const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');
      const dayStart = new Date(
        today.getFullYear(),
        today.getMonth(),
        today.getDate(),
      );

      let created: Awaited<ReturnType<typeof this.createSaleRecord>> | null =
        null;
      for (let attempt = 0; attempt < 3 && !created; attempt++) {
        const count = await tx.posSale.count({
          where: { branchId, createdAt: { gte: dayStart } },
        });
        const saleNumber = `POS-${dateStr}-${String(count + 1 + attempt).padStart(4, '0')}`;
        try {
          created = await this.createSaleRecord(tx, {
            saleNumber,
            branchId,
            staffId: staffUserId,
            dto,
            subtotal,
            discount,
            total,
            change,
            saleItems,
          });
        } catch (e) {
          // Unique violation on saleNumber (P2002) — retry with next sequence
          if (
            e instanceof Prisma.PrismaClientKnownRequestError &&
            e.code === 'P2002'
          ) {
            continue;
          }
          throw e;
        }
      }
      if (!created) {
        throw new BadRequestException(
          'Could not allocate a unique sale number — try again',
        );
      }
      return created;
    });

    // Audit trail (outside the transaction — best-effort)
    await this.auditService
      .log({
        actorId: staffUserId,
        action: 'POS_SALE',
        targetType: 'PosSale',
        targetId: sale.id,
        outcome: 'SUCCESS',
        metadata: {
          saleNumber: sale.saleNumber,
          total: sale.total.toString(),
          paymentMethod: sale.paymentMethod,
          items: sale.items.map((i) => ({
            medicationId: i.medicationId,
            name: i.name,
            quantity: i.quantity,
            total: i.total.toString(),
          })),
        },
      })
      .catch(() => undefined);

    return {
      ...sale,
      receipt: this.buildReceipt(sale),
    };
  }

  private async createSaleRecord(
    tx: Tx,
    args: {
      saleNumber: string;
      branchId: string;
      staffId: string;
      dto: CreatePosSaleDto;
      subtotal: Prisma.Decimal;
      discount: Prisma.Decimal;
      total: Prisma.Decimal;
      change: Prisma.Decimal;
      saleItems: {
        medicationId: string;
        name: string;
        quantity: number;
        unitPrice: Prisma.Decimal;
        total: Prisma.Decimal;
      }[];
    },
  ) {
    return tx.posSale.create({
      data: {
        saleNumber: args.saleNumber,
        branchId: args.branchId,
        staffId: args.staffId,
        patientName: args.dto.patientName,
        patientPhone: args.dto.patientPhone,
        patientId: args.dto.patientId,
        prescriptionId: args.dto.prescriptionId,
        notes: args.dto.notes,
        subtotal: args.subtotal,
        discount: args.discount,
        total: args.total,
        paymentMethod: args.dto.paymentMethod,
        amountReceived: args.dto.amountReceived,
        change: args.change,
        items: {
          create: args.saleItems,
        },
      },
      include: {
        items: true,
        branch: { select: { name: true, address: true, phone: true } },
      },
    });
  }

  // ──────────────────────────────────────────
  // Get POS sales for the staff's branch
  // ──────────────────────────────────────────
  async getSales(
    staffUserId: string,
    filters: {
      date?: string;
      paymentMethod?: string;
      limit?: number;
      offset?: number;
    },
  ) {
    const branchId = await this.resolveBranchId(staffUserId);

    const where: Prisma.PosSaleWhereInput = { branchId };

    if (filters.date) {
      const d = new Date(filters.date);
      where.createdAt = {
        gte: new Date(d.getFullYear(), d.getMonth(), d.getDate()),
        lt: new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1),
      };
    }

    if (filters.paymentMethod) {
      where.paymentMethod = filters.paymentMethod as never;
    }

    const [sales, total] = await this.prisma.$transaction([
      this.prisma.posSale.findMany({
        where,
        include: {
          items: { include: { medication: { select: { name: true } } } },
        },
        orderBy: { createdAt: 'desc' },
        take: filters.limit ?? 50,
        skip: filters.offset ?? 0,
      }),
      this.prisma.posSale.count({ where }),
    ]);

    return { sales, total };
  }

  // ──────────────────────────────────────────
  // Get a single POS sale by ID
  // ──────────────────────────────────────────
  async getSaleById(id: string) {
    const sale = await this.prisma.posSale.findUnique({
      where: { id },
      include: {
        items: true,
        branch: { select: { name: true, address: true, phone: true } },
      },
    });
    if (!sale) throw new NotFoundException('POS sale not found');
    return { ...sale, receipt: this.buildReceipt(sale) };
  }

  // ──────────────────────────────────────────
  // Branch daily summary
  // ──────────────────────────────────────────
  async getDailySummary(staffUserId: string, date?: string) {
    const branchId = await this.resolveBranchId(staffUserId);

    const d = date ? new Date(date) : new Date();
    const start = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const end = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);

    const sales = await this.prisma.posSale.findMany({
      where: { branchId, createdAt: { gte: start, lt: end } },
      include: { items: true },
    });

    const totalRevenue = sales.reduce(
      (sum, s) => sum.add(s.total),
      new Prisma.Decimal(0),
    );
    const totalTransactions = sales.length;
    const totalItemsSold = sales.reduce(
      (sum, s) => sum + s.items.reduce((a, i) => a + i.quantity, 0),
      0,
    );

    const byPaymentMethod: Record<string, { count: number; amount: string }> =
      {};
    for (const s of sales) {
      const pm = s.paymentMethod;
      if (!byPaymentMethod[pm]) byPaymentMethod[pm] = { count: 0, amount: '0' };
      byPaymentMethod[pm].count += 1;
      byPaymentMethod[pm].amount = new Prisma.Decimal(
        byPaymentMethod[pm].amount,
      )
        .add(s.total)
        .toString();
    }

    return {
      date: start.toISOString().slice(0, 10),
      branchId,
      totalRevenue: totalRevenue.toString(),
      totalTransactions,
      totalItemsSold,
      byPaymentMethod,
    };
  }

  // ──────────────────────────────────────────
  // Build a receipt object from a sale
  // ──────────────────────────────────────────
  private buildReceipt(sale: {
    saleNumber: string;
    createdAt: Date;
    patientName?: string | null;
    patientPhone?: string | null;
    subtotal: Prisma.Decimal | number;
    discount: Prisma.Decimal | number;
    total: Prisma.Decimal | number;
    paymentMethod: string;
    amountReceived: Prisma.Decimal | number;
    change: Prisma.Decimal | number;
    items: {
      name: string;
      quantity: number;
      unitPrice: Prisma.Decimal | number;
      total: Prisma.Decimal | number;
    }[];
    branch?: { name: string; address: string; phone: string } | null;
  }) {
    const dec = (v: Prisma.Decimal | number) =>
      v instanceof Prisma.Decimal ? Number(v) : v;

    // Tax line (informational until URA EFRIS lands — Task 4). 0 by default.
    const taxRate = Number(this.configService.get('POS_TAX_RATE') ?? 0);
    const taxAmount = Math.round(dec(sale.total) * taxRate * 100) / 100;

    return {
      receiptNumber: sale.saleNumber,
      date: sale.createdAt,
      receiptType: 'WALK_IN_POS',
      pharmacy: {
        name: sale.branch?.name ?? 'E-Vuze Pharmacy',
        address: sale.branch?.address ?? '',
        phone: sale.branch?.phone ?? '',
      },
      customer: {
        name: sale.patientName ?? 'Walk-in Customer',
        phone: sale.patientPhone ?? '',
      },
      items: sale.items.map((i) => ({
        name: i.name,
        qty: i.quantity,
        unitPrice: dec(i.unitPrice),
        total: dec(i.total),
      })),
      subtotal: dec(sale.subtotal),
      discount: dec(sale.discount),
      total: dec(sale.total),
      taxRate,
      taxAmount,
      paymentMethod: sale.paymentMethod,
      amountReceived: dec(sale.amountReceived),
      change: dec(sale.change),
    };
  }
}
