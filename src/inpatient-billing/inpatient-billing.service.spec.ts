import { ConflictException, ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AdmissionStatus, HospitalBillingStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { InpatientBillingService } from './inpatient-billing.service';

describe('InpatientBillingService', () => {
  let service: InpatientBillingService;

  const prisma = {
    $queryRaw: jest.fn(),
    $transaction: jest.fn(),
    doctor: { findFirst: jest.fn() },
    hospital: { findFirst: jest.fn() },
    hospitalStaff: { findFirst: jest.fn() },
    inpatientAdmission: { findMany: jest.fn(), findUnique: jest.fn() },
    supplyConsumption: { create: jest.fn() },
    hospitalInvoice: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    hospitalInvoiceItem: { findFirst: jest.fn(), create: jest.fn() },
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    prisma.$transaction.mockImplementation(
      (callback: (tx: typeof prisma) => unknown) => callback(prisma),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InpatientBillingService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get(InpatientBillingService);
  });

  const mockDoctor = (hospitalId = 'h-1') => {
    prisma.doctor.findFirst.mockResolvedValue({ hospitalId });
  };

  const supplyDto = {
    itemName: 'Syringe',
    quantity: 2,
    unitCost: 500,
  };

  it('rejects cross-hospital supply charges', async () => {
    mockDoctor('h-2');
    prisma.inpatientAdmission.findUnique.mockResolvedValue({
      id: 'adm-1',
      hospitalId: 'h-1',
      status: AdmissionStatus.ACTIVE,
      hospitalInvoice: null,
    });

    await expect(
      service.logSupplyConsumption('adm-1', supplyDto, 'doc-1', 'DOCTOR'),
    ).rejects.toThrow(ForbiddenException);
    expect(prisma.supplyConsumption.create).not.toHaveBeenCalled();
  });

  it('rejects charges after discharge', async () => {
    mockDoctor();
    prisma.inpatientAdmission.findUnique.mockResolvedValue({
      id: 'adm-1',
      hospitalId: 'h-1',
      status: AdmissionStatus.DISCHARGED,
      hospitalInvoice: null,
    });

    await expect(
      service.logSupplyConsumption('adm-1', supplyDto, 'doc-1', 'DOCTOR'),
    ).rejects.toThrow(ConflictException);
    expect(prisma.hospitalInvoice.create).not.toHaveBeenCalled();
  });

  it('rejects new charges on a paid invoice', async () => {
    mockDoctor();
    prisma.inpatientAdmission.findUnique.mockResolvedValue({
      id: 'adm-1',
      hospitalId: 'h-1',
      status: AdmissionStatus.ACTIVE,
      hospitalInvoice: {
        id: 'invoice-1',
        paymentStatus: HospitalBillingStatus.PAID,
      },
    });

    await expect(
      service.logSupplyConsumption('adm-1', supplyDto, 'doc-1', 'DOCTOR'),
    ).rejects.toThrow(ConflictException);
    expect(prisma.supplyConsumption.create).not.toHaveBeenCalled();
  });

  it('records supply consumption and its invoice update atomically', async () => {
    mockDoctor();
    prisma.inpatientAdmission.findUnique.mockResolvedValue({
      id: 'adm-1',
      patientId: 'patient-1',
      hospitalId: 'h-1',
      status: AdmissionStatus.ACTIVE,
      hospitalInvoice: null,
    });
    prisma.hospitalInvoice.create.mockResolvedValue({ id: 'invoice-1' });

    await service.logSupplyConsumption('adm-1', supplyDto, 'doc-1', 'DOCTOR');

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.supplyConsumption.create).toHaveBeenCalledWith({
      data: {
        admissionId: 'adm-1',
        itemName: 'Syringe',
        category: 'SUPPLIES',
        quantity: 2,
        unitCost: 500,
        totalCost: 1000,
        administeredBy: 'doc-1',
      },
    });
    expect(prisma.hospitalInvoiceItem.create).toHaveBeenCalledWith({
      data: {
        invoiceId: 'invoice-1',
        description: 'Supply: Syringe',
        quantity: 2,
        unitCost: 500,
        subtotal: 1000,
        category: 'SUPPLIES',
      },
    });
    expect(prisma.hospitalInvoice.update).toHaveBeenCalledWith({
      where: { id: 'invoice-1' },
      data: { totalAmount: { increment: 1000 } },
    });
  });

  it('rejects cross-hospital invoice reads', async () => {
    mockDoctor('h-2');
    prisma.inpatientAdmission.findUnique.mockResolvedValue({
      hospitalId: 'h-1',
    });

    await expect(
      service.getCheckoutInvoice('adm-1', 'doc-1', 'DOCTOR'),
    ).rejects.toThrow(ForbiddenException);
    expect(prisma.hospitalInvoice.findUnique).not.toHaveBeenCalled();
  });

  it('rechecks admission state under lock before a daily bed charge', async () => {
    prisma.inpatientAdmission.findMany.mockResolvedValue([{ id: 'adm-1' }]);
    prisma.inpatientAdmission.findUnique.mockResolvedValue({
      id: 'adm-1',
      status: AdmissionStatus.DISCHARGED,
    });

    await service.handleDailyWardCharges();

    expect(prisma.hospitalInvoiceItem.create).not.toHaveBeenCalled();
    expect(prisma.hospitalInvoice.update).not.toHaveBeenCalled();
  });

  it('does not add the same daily bed charge twice', async () => {
    prisma.inpatientAdmission.findMany.mockResolvedValue([{ id: 'adm-1' }]);
    prisma.inpatientAdmission.findUnique.mockResolvedValue({
      id: 'adm-1',
      patientId: 'patient-1',
      hospitalId: 'h-1',
      status: AdmissionStatus.ACTIVE,
      bed: {
        number: '101',
        ward: { name: 'General', baseBedCharge: 10000 },
      },
      hospitalInvoice: {
        id: 'invoice-1',
        paymentStatus: HospitalBillingStatus.UNPAID,
      },
    });
    prisma.hospitalInvoiceItem.findFirst.mockResolvedValue({
      id: 'existing-charge',
    });

    await service.handleDailyWardCharges();

    expect(prisma.hospitalInvoiceItem.create).not.toHaveBeenCalled();
    expect(prisma.hospitalInvoice.update).not.toHaveBeenCalled();
  });
});
