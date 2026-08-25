// backend/src/prescriptions/prescriptions.service.spec.ts
// UGANDA — Task E: unit tests for walk-in upload, branch queue and
// confirm-transcription. Mocked persistence: no real DB (CTO hard rule).

import { Test } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrescriptionsService } from './prescriptions.service';
import { PrismaService } from '../prisma/prisma.service';
import { PatientsService } from '../patients/patients.service';
import { NotificationsService } from '../notifications/notifications.service';
import { MedicationsService } from '../medications/medications.service';
import { ConfigService } from '@nestjs/config';
import { StaffService } from '../staff/staff.service';
import { HospitalsService } from '../hospitals/hospitals.service';
import { OrdersService } from '../orders/orders.service';

describe('PrescriptionsService', () => {
  let service: PrescriptionsService;
  let prisma: any;
  let staffService: any;
  let ordersService: any;

  const mocks = () => {
    prisma = {
      branch: {
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn().mockResolvedValue({ pharmacyId: 'ph1' }),
      },
      patient: {
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'pat-walkin' }),
      },
      user: {
        create: jest.fn().mockResolvedValue({ id: 'user-walkin' }),
      },
      prescription: {
        create: jest.fn().mockResolvedValue({ id: 'rx1', status: 'PENDING' }),
        findUnique: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue({ id: 'rx1', status: 'APPROVED' }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      prescriptionMedication: {
        findFirst: jest.fn().mockResolvedValue(null),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        createMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      medication: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'm1',
          name: 'Amoxicillin 500mg',
          price: 1500,
          quantity: 20,
        }),
      },
      $transaction: jest.fn().mockImplementation((arg: any) =>
        Array.isArray(arg) ? Promise.all(arg) : arg({}),
      ),
    };
    staffService = {
      findByUserId: jest.fn().mockResolvedValue({ branchId: 'b1' }),
    };
    ordersService = {
      create: jest.fn().mockResolvedValue({ id: 'ord1', orderNumber: 'ORD-1' }),
    };
  };

  beforeEach(async () => {
    mocks();
    const module = await Test.createTestingModule({
      providers: [
        PrescriptionsService,
        { provide: PrismaService, useValue: prisma },
        { provide: PatientsService, useValue: {} },
        { provide: NotificationsService, useValue: {} },
        { provide: MedicationsService, useValue: {} },
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue(undefined) } },
        { provide: StaffService, useValue: staffService },
        { provide: HospitalsService, useValue: {} },
        { provide: OrdersService, useValue: ordersService },
      ],
    }).compile();

    service = module.get(PrescriptionsService);
  });

  describe('getOrCreateWalkInPatientId (via staffDirectUpload)', () => {
    it('reuses an existing patient with the same phone — no new user created', async () => {
      prisma.patient.findFirst = jest.fn().mockResolvedValue({ id: 'pat-existing' });

      const result = await service.staffDirectUpload('u1', {
        fileUrl: 'https://cdn/x.jpg',
        fileName: 'x.jpg',
        fileType: 'image/jpeg',
        patientPhone: '256700000000',
      });

      expect(prisma.patient.findFirst).toHaveBeenCalledWith({
        where: { phone: '256700000000' },
        select: { id: true },
      });
      expect(prisma.user.create).not.toHaveBeenCalled();
      expect(prisma.prescription.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ patientId: 'pat-existing' }) }),
      );
      expect(result.prescription.id).toBe('rx1');
    });

    it('creates a guest user + patient for a new walk-in (no phone → placeholder)', async () => {
      const result = await service.staffDirectUpload('u1', {
        fileUrl: 'https://cdn/y.jpg',
        fileName: 'y.jpg',
        fileType: 'image/jpeg',
        patientName: 'John Mugisha',
      });

      expect(prisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ role: 'PATIENT', email: expect.stringMatching(/^walkin-.*@evuze\.local$/) }),
        }),
      );
      expect(prisma.patient.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: 'user-walkin',
            firstName: 'John',
            lastName: 'Mugisha',
            phone: '0000000000',
          }),
        }),
      );
      expect(result.message).toContain('Please verify manually');
    });

    it('uses the provided patientId and tags the prescription with branchId', async () => {
      prisma.patient.findUnique = jest.fn().mockResolvedValue({ id: 'pat-registered' });

      await service.staffDirectUpload('u1', {
        fileUrl: 'https://cdn/z.jpg',
        fileName: 'z.jpg',
        fileType: 'image/jpeg',
        patientId: 'pat-registered',
      });

      expect(prisma.patient.findFirst).not.toHaveBeenCalled();
      expect(prisma.prescription.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            patientId: 'pat-registered',
            branchId: 'b1',
            status: 'PENDING',
          }),
        }),
      );
    });

    it('throws Forbidden when the staff member has no branch', async () => {
      staffService.findByUserId = jest.fn().mockRejectedValue(new Error('no staff'));

      await expect(
        service.staffDirectUpload('u1', {
          fileUrl: 'x',
          fileName: 'x',
          fileType: 'image/jpeg',
        }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('confirmTranscription', () => {
    const confirmDto = {
      items: [
        { medicationId: 'm1', name: 'Amoxicillin 500mg', dosage: '500mg', quantity: 10 },
        { name: 'Manual entry', quantity: 1 },
      ],
      createOrder: false,
    };

    beforeEach(() => {
      prisma.prescription.findUnique = jest.fn().mockResolvedValue({
        id: 'rx1',
        branchId: 'b1',
        patient: { id: 'pat1', userId: 'u-patient' },
      });
    });

    it('persists corrected items, marks APPROVED and resolves prices', async () => {
      const result = await service.confirmTranscription('u1', 'rx1', confirmDto as any);

      expect(prisma.prescriptionMedication.deleteMany).toHaveBeenCalledWith({
        where: { prescriptionId: 'rx1' },
      });
      expect(prisma.prescriptionMedication.createMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.arrayContaining([
            expect.objectContaining({ medicationName: 'Amoxicillin 500mg', matchedMedicationId: 'm1', available: true }),
            expect.objectContaining({ medicationName: 'Manual entry', available: false }),
          ]),
        }),
      );
      expect(prisma.prescription.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'APPROVED', aiProcessingStatus: 'COMPLETED' }) }),
      );
      expect(ordersService.create).not.toHaveBeenCalled();
      // item with medicationId resolved against branch inventory
      expect(result.items[0]).toEqual(expect.objectContaining({ price: 1500, available: true }));
    });

    it('creates a structured order when createOrder is true', async () => {
      await service.confirmTranscription('u1', 'rx1', { ...confirmDto, createOrder: true } as any);

      expect(ordersService.create).toHaveBeenCalledWith(
        'u1',
        expect.objectContaining({
          pharmacyId: 'ph1',
          branchId: 'b1',
          type: 'PICKUP',
          paymentMethod: 'CASH',
          patientId: 'pat1',
          prescriptionId: 'rx1',
          items: [{ medicationId: 'm1', quantity: 10 }],
        }),
      );
    });

    it('forbids confirming a prescription that belongs to another branch', async () => {
      prisma.prescription.findUnique = jest.fn().mockResolvedValue({
        id: 'rx1',
        branchId: 'b2', // different branch
        patient: { id: 'pat1', userId: 'u-patient' },
      });
      prisma.prescriptionMedication.findFirst = jest.fn().mockResolvedValue(null);

      await expect(
        service.confirmTranscription('u1', 'rx1', confirmDto as any),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('findByBranch', () => {
    it('queries prescriptions tagged with branchId OR linked through matched inventory', async () => {
      staffService.findByUserId = jest.fn().mockResolvedValue({ branch: { id: 'b1' } });

      await service.findByBranch('u1', 'PENDING');

      expect(prisma.prescription.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            OR: [
              { branchId: 'b1' },
              {
                prescriptionMedications: {
                  some: { matchedMedication: { branchId: 'b1' } },
                },
              },
            ],
            status: 'PENDING',
          },
        }),
      );
    });

    it('falls back to branch-manager resolution when staff lookup fails', async () => {
      staffService.findByUserId = jest.fn().mockRejectedValue(new Error('no staff'));
      prisma.branch.findFirst = jest.fn().mockResolvedValue({ id: 'b-manager' });

      await service.findByBranch('u-manager');

      expect(prisma.prescription.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ OR: expect.arrayContaining([{ branchId: 'b-manager' }]) }),
        }),
      );
    });
  });
});
