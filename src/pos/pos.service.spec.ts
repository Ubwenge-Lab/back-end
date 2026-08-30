// backend/src/pos/pos.service.spec.ts
// UGANDA — Task E: first unit tests for the hardened POS service.
// Mocked persistence layer: no real DB (CTO hard rule).

import { Test } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PosService } from './pos.service';
import { PrismaService } from '../prisma/prisma.service';
import { StaffService } from '../staff/staff.service';
import { AuditService } from '../audit/audit.service';
import { ConfigService } from '@nestjs/config';

describe('PosService', () => {
  let service: PosService;
  let prisma: any;
  let staffService: any;
  let auditService: any;

  const med = {
    id: 'm1',
    name: 'Paracetamol 500mg',
    price: 2500,
    quantity: 10,
    branchId: 'b1',
  };

  const makeTx = (overrides: Record<string, unknown> = {}) => ({
    medication: {
      findFirst: jest.fn().mockResolvedValue(med),
      findUnique: jest.fn().mockResolvedValue({ quantity: 3 }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    posSale: {
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn().mockResolvedValue(fakeSale()),
    },
    ...overrides,
  });

  function fakeSale() {
    return {
      id: 'sale-1',
      saleNumber: 'POS-20260803-0001',
      branchId: 'b1',
      staffId: 'u1',
      patientName: null,
      patientPhone: null,
      patientId: null,
      prescriptionId: null,
      notes: null,
      subtotal: new Prisma.Decimal(5000),
      discount: new Prisma.Decimal(0),
      total: new Prisma.Decimal(5000),
      paymentMethod: 'CASH',
      amountReceived: new Prisma.Decimal(5000),
      change: new Prisma.Decimal(0),
      createdAt: new Date('2026-08-03T10:00:00Z'),
      items: [
        {
          id: 'i1',
          medicationId: 'm1',
          name: 'Paracetamol 500mg',
          quantity: 2,
          unitPrice: new Prisma.Decimal(2500),
          total: new Prisma.Decimal(5000),
        },
      ],
      branch: { name: 'Branch 1', address: 'Kampala', phone: '2567...' },
    };
  }

  const dto = {
    items: [{ medicationId: 'm1', quantity: 2 }],
    paymentMethod: 'CASH',
    amountReceived: 5000,
    discount: 0,
  };

  beforeEach(async () => {
    prisma = {
      $transaction: jest.fn((cb: any) => cb(makeTx())),
      branch: { findFirst: jest.fn().mockResolvedValue(null) },
      prescription: { findUnique: jest.fn().mockResolvedValue(null) },
      posSale: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue(null),
      },
    };
    staffService = {
      findByUserId: jest.fn().mockResolvedValue({ branchId: 'b1' }),
    };
    auditService = {
      log: jest.fn().mockResolvedValue(undefined),
    };
    const configService = { get: jest.fn().mockReturnValue(undefined) };

    const module = await Test.createTestingModule({
      providers: [
        PosService,
        { provide: PrismaService, useValue: prisma },
        { provide: StaffService, useValue: staffService },
        { provide: AuditService, useValue: auditService },
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    service = module.get(PosService);
  });

  describe('createSale', () => {
    it('completes a sale: atomic decrement, Decimal totals, receipt, audit trail', async () => {
      const tx = makeTx();
      prisma.$transaction = jest.fn((cb: any) => cb(tx));

      const result = await service.createSale('u1', dto as any);

      expect(result.saleNumber).toBe('POS-20260803-0001');
      expect(result.receipt.total).toBe(5000);
      expect(result.receipt.receiptType).toBe('WALK_IN_POS');
      expect(result.receipt.taxAmount).toBe(0);

      // Atomic stock guard: the decrement WHERE must include quantity gte
      expect(tx.medication.updateMany).toHaveBeenCalledWith({
        where: { id: 'm1', branchId: 'b1', quantity: { gte: 2 } },
        data: { quantity: { decrement: 2 } },
      });

      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'POS_SALE', outcome: 'SUCCESS' }),
      );
      expect(auditService.log.mock.calls[0][0].metadata.saleNumber).toBe('POS-20260803-0001');
    });

    it('rejects oversell: atomic updateMany returns 0 → BadRequest, no sale, no audit', async () => {
      prisma.$transaction = jest.fn((cb: any) =>
        cb(
          makeTx({
            medication: {
              findFirst: jest.fn().mockResolvedValue(med),
              findUnique: jest.fn().mockResolvedValue({ quantity: 1 }),
              updateMany: jest.fn().mockResolvedValue({ count: 0 }), // not enough stock
            },
          }),
        ),
      );

      await expect(service.createSale('u1', dto as any)).rejects.toThrow(
        BadRequestException,
      );
      expect(auditService.log).not.toHaveBeenCalled();
    });

    it('rejects when amount received is below the total', async () => {
      await expect(
        service.createSale('u1', { ...dto, amountReceived: 1000 } as any),
      ).rejects.toThrow(BadRequestException);
      expect(auditService.log).not.toHaveBeenCalled();
    });

    it('retries with the next sequence number when saleNumber collides (P2002)', async () => {
      const tx = makeTx();
      let calls = 0;
      tx.posSale.create = jest.fn().mockImplementation(() => {
        calls++;
        if (calls === 1) {
          throw new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
            code: 'P2002',
            clientVersion: '6.0.0',
          });
        }
        return fakeSale();
      });
      prisma.$transaction = jest.fn((cb: any) => cb(tx));

      const result = await service.createSale('u1', dto as any);

      expect(calls).toBe(2);
      // second attempt used count + 1 + attempt(1) => '0002' (with today's date)
      const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      expect(tx.posSale.create.mock.calls[1][0].data.saleNumber).toBe(`POS-${today}-0002`);
      expect(result.receipt).toBeDefined();
    });

    it('rejects a non-APPROVED prescriptionId', async () => {
      prisma.prescription.findUnique = jest.fn().mockResolvedValue({
        id: 'rx1',
        status: 'PENDING',
      });

      await expect(
        service.createSale('u1', { ...dto, prescriptionId: 'rx1' } as any),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('getDailySummary', () => {
    it('returns revenue, counts and branchId', async () => {
      prisma.posSale.findMany = jest.fn().mockResolvedValue([
        { total: new Prisma.Decimal(5000), items: [{ quantity: 2 }] },
        { total: new Prisma.Decimal(2500), items: [{ quantity: 1 }, { quantity: 1 }] },
      ]);

      const summary = await service.getDailySummary('u1', '2026-08-03');

      expect(summary.branchId).toBe('b1');
      expect(summary.totalTransactions).toBe(2);
      expect(summary.totalItemsSold).toBe(4);
      expect(summary.totalRevenue.toString()).toBe('7500');
    });
  });
});
