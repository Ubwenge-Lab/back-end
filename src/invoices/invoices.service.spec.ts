import { ForbiddenException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test, TestingModule } from '@nestjs/testing';
import { HospitalBillingStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { InvoicesService } from './invoices.service';

describe('InvoicesService', () => {
  let service: InvoicesService;

  const prisma = {
    $queryRaw: jest.fn(),
    $transaction: jest.fn(),
    hospital: { findFirst: jest.fn() },
    hospitalStaff: { findFirst: jest.fn() },
    hospitalInvoice: { findUnique: jest.fn(), update: jest.fn() },
    patient: { findUnique: jest.fn() },
  };
  const eventEmitter = { emit: jest.fn() };

  beforeEach(async () => {
    jest.resetAllMocks();
    prisma.$transaction.mockImplementation(
      (callback: (tx: typeof prisma) => unknown) => callback(prisma),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InvoicesService,
        { provide: PrismaService, useValue: prisma },
        { provide: EventEmitter2, useValue: eventEmitter },
      ],
    }).compile();
    service = module.get(InvoicesService);
  });

  it('scopes receptionist payments to their hospital', async () => {
    prisma.hospitalStaff.findFirst.mockResolvedValue({ hospitalId: 'h-2' });
    prisma.hospitalInvoice.findUnique.mockResolvedValue({
      admissionId: 'adm-1',
      hospitalId: 'h-1',
    });

    await expect(
      service.pay('invoice-1', 'reception-1', 'RECEPTIONIST'),
    ).rejects.toThrow(ForbiddenException);
    expect(prisma.hospitalInvoice.update).not.toHaveBeenCalled();
  });

  it('locks the admission and invoice before marking an inpatient invoice paid', async () => {
    prisma.hospitalStaff.findFirst.mockResolvedValue({ hospitalId: 'h-1' });
    prisma.hospitalInvoice.findUnique
      .mockResolvedValueOnce({
        admissionId: 'adm-1',
        hospitalId: 'h-1',
      })
      .mockResolvedValueOnce({
        id: 'invoice-1',
        paymentStatus: HospitalBillingStatus.UNPAID,
      });
    prisma.hospitalInvoice.update.mockResolvedValue({
      id: 'invoice-1',
      patientId: 'patient-1',
      patient: { firstName: 'Pat', lastName: 'Ient' },
    });
    prisma.patient.findUnique.mockResolvedValue({ user: { email: null } });

    await service.pay('invoice-1', 'reception-1', 'RECEPTIONIST');

    expect(prisma.$queryRaw).toHaveBeenCalledTimes(2);
    expect(prisma.hospitalInvoice.update).toHaveBeenCalledWith({
      where: { id: 'invoice-1' },
      data: { paymentStatus: HospitalBillingStatus.PAID },
      // Jest asymmetric matchers are intentionally untyped test values.
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      include: expect.any(Object),
    });
  });
});
