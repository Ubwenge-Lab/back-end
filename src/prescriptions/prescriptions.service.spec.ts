import { Test, TestingModule } from '@nestjs/testing';
import { PrescriptionsService } from './prescriptions.service';
import { PrismaService } from '../prisma/prisma.service';
import { PatientsService } from '../patients/patients.service';
import { NotificationsService } from '../notifications/notifications.service';
import { MedicationsService } from '../medications/medications.service';
import { ConfigService } from '@nestjs/config';
import { StaffService } from '../staff/staff.service';
import { HospitalsService } from '../hospitals/hospitals.service';
import { TriangulationService } from '../triangulation/triangulation.service';
import {
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { FulfillmentStatus } from './dto/external-fulfillment-webhook.dto';

describe('PrescriptionsService - Out-of-Stock Fallback & Fulfillment', () => {
  let service: PrescriptionsService;
  let prismaMock: any;
  let triangulationServiceMock: any;
  let notificationsServiceMock: any;

  beforeEach(async () => {
    prismaMock = {
      $transaction: jest.fn((cb) => cb(prismaMock)),
      $queryRaw: jest.fn().mockResolvedValue([]),
      doctor: { findUnique: jest.fn() },
      appointment: { findUnique: jest.fn() },
      hospital: { findUnique: jest.fn() },
      prescription: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findMany: jest.fn(),
      },
      hospitalInvoice: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      hospitalInvoiceItem: { create: jest.fn() },
      hospitalDrugStock: {
        findMany: jest.fn(),
        update: jest.fn(),
      },
      prescriptionMedication: {
        create: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        update: jest.fn(),
        findMany: jest.fn(),
      },
      medication: {
        findMany: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      order: { create: jest.fn() },
    };

    triangulationServiceMock = {
      getNearbyPharmacies: jest.fn(),
    };

    notificationsServiceMock = {
      create: jest.fn().mockResolvedValue(true),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PrescriptionsService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: PatientsService, useValue: {} },
        { provide: NotificationsService, useValue: notificationsServiceMock },
        { provide: MedicationsService, useValue: {} },
        { provide: ConfigService, useValue: { get: jest.fn() } },
        { provide: StaffService, useValue: {} },
        { provide: HospitalsService, useValue: {} },
        { provide: TriangulationService, useValue: triangulationServiceMock },
      ],
    }).compile();

    service = module.get<PrescriptionsService>(PrescriptionsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // =========================================================================
  // 1. TRIANGULATED PHARMACY SEARCH (10km Radius)
  // =========================================================================
  describe('findNearestPharmacyWithStockWithinRadius', () => {
    const lat = -1.9441;
    const lng = 30.0619;

    it('should return pharmacy and matched medication ID when stock is available within 10km', async () => {
      triangulationServiceMock.getNearbyPharmacies.mockResolvedValue([
        {
          id: 'branch-1',
          locationType: 'BRANCH',
          pharmacyId: 'pharmacy-1',
          branchId: 'branch-1',
          distance: 2.5,
        },
      ]);
      prismaMock.medication.findMany.mockResolvedValue([
        {
          id: 'med-123',
          pharmacyId: 'pharmacy-1',
          branchId: 'branch-1',
        },
      ]);

      const result = await service.findNearestPharmacyWithStockWithinRadius(
        lat,
        lng,
        'Amoxicillin',
        10,
        10,
      );

      expect(triangulationServiceMock.getNearbyPharmacies).toHaveBeenCalledWith(
        lat,
        lng,
        10,
      );
      expect(prismaMock.medication.findMany).toHaveBeenCalledWith({
        where: {
          branchId: { in: ['branch-1'] },
          quantity: { gte: 10 },
          name: { contains: 'Amoxicillin', mode: 'insensitive' },
        },
        select: { id: true, pharmacyId: true, branchId: true },
      });
      expect(result).toEqual({
        pharmacyId: 'pharmacy-1',
        branchId: 'branch-1',
        matchedMedicationId: 'med-123',
      });
    });

    it('should not assign a pharmacy that has no matching stock', async () => {
      triangulationServiceMock.getNearbyPharmacies.mockResolvedValue([
        {
          id: 'branch-fallback',
          locationType: 'BRANCH',
          pharmacyId: 'pharmacy-fallback',
          branchId: 'branch-fallback',
          distance: 3.0,
        },
      ]);
      prismaMock.medication.findMany.mockResolvedValue([]);

      const result = await service.findNearestPharmacyWithStockWithinRadius(
        lat,
        lng,
        'RareDrug',
        5,
        10,
      );

      expect(result).toBeNull();
    });

    it('should return null if no pharmacies are found within 10km', async () => {
      triangulationServiceMock.getNearbyPharmacies.mockResolvedValue([]);

      const result = await service.findNearestPharmacyWithStockWithinRadius(
        lat,
        lng,
        'Paracetamol',
        1,
        10,
      );

      expect(result).toBeNull();
    });
  });

  // =========================================================================
  // 2. STOCK CHECKER FALLBACK & HOSPITAL ISSUANCE
  // =========================================================================
  describe('emitHospitalDigitalPrescription (Stock Checker Fallback)', () => {
    const doctorUserId = 'doc-user-1';
    const dto = {
      hospitalId: 'hospital-1',
      patientId: 'patient-1',
      appointmentId: 'appointment-1',
      refillsAllowed: 1,
      medications: [{ name: 'Amoxicillin', dosage: '500mg', quantity: 2 }],
    };

    beforeEach(() => {
      prismaMock.doctor.findUnique.mockResolvedValue({
        id: 'doc-1',
        licenseNumber: 'LIC123',
      });
      prismaMock.appointment.findUnique.mockResolvedValue({
        id: 'appointment-1',
        diagnosisSummary: 'Flu',
      });
      prismaMock.hospital.findUnique.mockResolvedValue({
        id: 'hospital-1',
        latitude: -1.94,
        longitude: 30.06,
      });
      prismaMock.prescription.findUnique.mockResolvedValue(null); // ID unique check
      prismaMock.prescription.create.mockResolvedValue({
        id: 'EVUZE-PRESC-2026-100001',
      });
      prismaMock.hospitalInvoice.findUnique.mockResolvedValue({ id: 'inv-1' });
      triangulationServiceMock.getNearbyPharmacies.mockResolvedValue([]);
    });

    it('should dispense internally when hospital stock is sufficient', async () => {
      // Internal drug stock found
      prismaMock.hospitalDrugStock.findMany.mockResolvedValue([
        {
          drugId: 'drug-1',
          hospitalId: 'hospital-1',
          quantity: 20,
          unitPrice: 500,
          drug: { brandName: 'Amoxicillin', genericName: 'Amoxicillin' },
        },
      ]);
      prismaMock.prescriptionMedication.create.mockResolvedValue({
        id: 'pm-1',
        isHospitalMed: true,
        dispenseStatus: 'HOSPITAL_DISPENSED',
      });

      const response = await service.emitHospitalDigitalPrescription(
        doctorUserId,
        dto as any,
      );

      expect(prismaMock.hospitalDrugStock.update).toHaveBeenCalledWith({
        where: {
          drugId_hospitalId: { drugId: 'drug-1', hospitalId: 'hospital-1' },
          quantity: { gte: 2 },
        },
        data: { quantity: { decrement: 2 } },
      });
      expect(response.summary.hospitalDispensed).toBe(1);
      expect(response.summary.routedToPharmacy).toBe(0);
    });

    it('should route to 10km external pharmacy when hospital stock is out-of-stock', async () => {
      // Hospital stock empty
      prismaMock.hospitalDrugStock.findMany.mockResolvedValue([]);

      // Mock 10km triangulation fallback
      jest
        .spyOn(service, 'findNearestPharmacyWithStockWithinRadius')
        .mockResolvedValue({
          pharmacyId: 'ext-pharmacy-99',
          branchId: 'ext-branch-99',
          matchedMedicationId: 'ext-med-99',
        });
      const nearbyLocations = [
        {
          id: 'ext-branch-99',
          locationType: 'BRANCH',
          pharmacyId: 'ext-pharmacy-99',
          branchId: 'ext-branch-99',
        },
      ];
      triangulationServiceMock.getNearbyPharmacies.mockResolvedValue(
        nearbyLocations,
      );

      prismaMock.prescriptionMedication.create.mockResolvedValue({
        id: 'pm-2',
        isHospitalMed: false,
        pharmacyId: 'ext-pharmacy-99',
        dispenseStatus: 'PENDING',
      });

      const response = await service.emitHospitalDigitalPrescription(
        doctorUserId,
        dto as any,
      );

      expect(
        service.findNearestPharmacyWithStockWithinRadius,
      ).toHaveBeenCalledWith(
        -1.94,
        30.06,
        'Amoxicillin',
        2,
        10,
        nearbyLocations,
      );
      expect(prismaMock.prescriptionMedication.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            isHospitalMed: false,
            pharmacyId: 'ext-pharmacy-99',
            dispenseStatus: 'PENDING',
          }),
        }),
      );
      expect(response.summary.routedToPharmacy).toBe(1);
    });
  });

  // =========================================================================
  // 3. EXTERNAL DISPATCH
  // =========================================================================
  describe('dispatchExternal', () => {
    it('should dispatch out-of-stock items to assigned external pharmacies', async () => {
      prismaMock.prescription.findUnique.mockResolvedValue({
        id: 'presc-1',
        patientId: 'patient-1',
        dispatchedAt: null,
        prescriptionMedications: [
          {
            id: 'pm-10',
            medicationName: 'Ibuprofen',
            isHospitalMed: false,
            dispenseStatus: 'PENDING',
            pharmacyId: 'pharmacy-ext-1',
            quantity: 2,
            matchedMedication: {
              id: 'med-10',
              pharmacyId: 'pharmacy-ext-1',
              branchId: 'branch-ext-1',
              price: 750,
              quantity: 10,
            },
          },
        ],
      });

      prismaMock.order.create.mockResolvedValue({ id: 'order-1' });

      const result = await service.dispatchExternal('presc-1');

      expect(prismaMock.order.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          patientId: 'patient-1',
          pharmacyId: 'pharmacy-ext-1',
          branchId: 'branch-ext-1',
          type: 'PICKUP',
          subtotal: 1500,
          total: 1500,
          orderItems: {
            create: [{ medicationId: 'med-10', quantity: 2, price: 750 }],
          },
        }),
        select: { id: true },
      });
      expect(prismaMock.medication.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'med-10',
          pharmacyId: 'pharmacy-ext-1',
          branchId: 'branch-ext-1',
          quantity: { gte: 2 },
        },
        data: { quantity: { decrement: 2 } },
      });
      expect(prismaMock.prescriptionMedication.updateMany).toHaveBeenCalledWith(
        {
          where: {
            prescriptionId: 'presc-1',
            id: { in: ['pm-10'] },
            dispenseStatus: 'PENDING',
          },
          data: { dispenseStatus: 'DISPATCHED_TO_PHARMACY' },
        },
      );
      expect(result.orders).toHaveLength(1);
    });

    it('should throw ConflictException if already dispatched', async () => {
      prismaMock.prescription.findUnique.mockResolvedValue({
        id: 'presc-1',
        dispatchedAt: new Date(),
      });

      await expect(service.dispatchExternal('presc-1')).rejects.toThrow(
        ConflictException,
      );
    });
  });

  // =========================================================================
  // 4. EXTERNAL FULFILLMENT WEBHOOK CALLBACK
  // =========================================================================
  describe('processExternalFulfillment', () => {
    const webhookDto = {
      prescriptionId: 'presc-1',
      pharmacyId: 'pharmacy-ext-1',
      prescriptionMedicationIds: ['pm-10'],
      status: FulfillmentStatus.FULFILLED,
      notes: 'Picked up by patient',
    };

    it('should mark items as FULFILLED and complete prescription when all items are ready', async () => {
      const mockPrescription = {
        id: 'presc-1',
        status: 'PENDING',
        refillsRemaining: 1,
        patient: { userId: 'user-patient-1' },
        prescriptionMedications: [
          {
            id: 'pm-10',
            pharmacyId: 'pharmacy-ext-1',
            dispenseStatus: 'DISPATCHED_TO_PHARMACY',
            isHospitalMed: false,
          },
        ],
      };

      prismaMock.prescription.findUnique.mockResolvedValue(mockPrescription);
      prismaMock.prescriptionMedication.findMany.mockResolvedValue([
        { id: 'pm-10', dispenseStatus: 'FULFILLED' },
      ]);
      prismaMock.prescription.update.mockResolvedValue({
        ...mockPrescription,
        status: 'APPROVED',
      });

      const result = await service.processExternalFulfillment(webhookDto);

      expect(prismaMock.prescriptionMedication.updateMany).toHaveBeenCalledWith(
        {
          where: {
            id: { in: ['pm-10'] },
            prescriptionId: 'presc-1',
            pharmacyId: 'pharmacy-ext-1',
            isHospitalMed: false,
          },
          data: {
            dispenseStatus: 'FULFILLED',
            fulfilledAt: expect.any(Date),
            available: true,
          },
        },
      );

      expect(prismaMock.prescription.update).toHaveBeenCalledWith({
        where: { id: 'presc-1' },
        data: {
          status: 'APPROVED',
          refillsRemaining: { decrement: 1 },
        },
        include: {
          prescriptionMedications: true,
          patient: { select: { userId: true } },
        },
      });

      expect(result.isFullyFulfilled).toBe(true);
    });

    it('should throw ForbiddenException if medication is assigned to a different pharmacy', async () => {
      prismaMock.prescription.findUnique.mockResolvedValue({
        id: 'presc-1',
        patient: { userId: 'u-1' },
        prescriptionMedications: [
          {
            id: 'pm-10',
            pharmacyId: 'pharmacy-UNAUTHORIZED',
            isHospitalMed: false,
          },
        ],
      });

      await expect(
        service.processExternalFulfillment(webhookDto),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects a request containing an item from another prescription', async () => {
      prismaMock.prescription.findUnique.mockResolvedValue({
        id: 'presc-1',
        status: 'PENDING',
        refillsRemaining: 1,
        patient: { userId: 'u-1' },
        prescriptionMedications: [
          {
            id: 'pm-10',
            pharmacyId: 'pharmacy-ext-1',
            isHospitalMed: false,
            dispenseStatus: 'DISPATCHED_TO_PHARMACY',
          },
        ],
      });

      await expect(
        service.processExternalFulfillment({
          ...webhookDto,
          prescriptionMedicationIds: ['pm-10', 'pm-other-prescription'],
        }),
      ).rejects.toThrow(BadRequestException);
      expect(
        prismaMock.prescriptionMedication.updateMany,
      ).not.toHaveBeenCalled();
    });

    it('rejects fulfillment before the medication has been dispatched', async () => {
      prismaMock.prescription.findUnique.mockResolvedValue({
        id: 'presc-1',
        status: 'APPROVED',
        refillsRemaining: 1,
        patient: { userId: 'u-1' },
        prescriptionMedications: [
          {
            id: 'pm-10',
            pharmacyId: 'pharmacy-ext-1',
            isHospitalMed: false,
            dispenseStatus: 'PENDING',
          },
        ],
      });

      await expect(
        service.processExternalFulfillment(webhookDto),
      ).rejects.toThrow(ConflictException);
      expect(
        prismaMock.prescriptionMedication.updateMany,
      ).not.toHaveBeenCalled();
    });

    it('does not mutate an already fulfilled item on a repeated callback', async () => {
      prismaMock.prescription.findUnique.mockResolvedValue({
        id: 'presc-1',
        status: 'APPROVED',
        refillsRemaining: 0,
        patient: { userId: 'u-1' },
        prescriptionMedications: [
          {
            id: 'pm-10',
            pharmacyId: 'pharmacy-ext-1',
            isHospitalMed: false,
            dispenseStatus: 'FULFILLED',
          },
        ],
      });

      const result = await service.processExternalFulfillment(webhookDto);

      expect(result.itemsUpdated).toBe(0);
      expect(
        prismaMock.prescriptionMedication.updateMany,
      ).not.toHaveBeenCalled();
    });

    it('rejects a callback that would regress a fulfilled item', async () => {
      prismaMock.prescription.findUnique.mockResolvedValue({
        id: 'presc-1',
        status: 'APPROVED',
        refillsRemaining: 0,
        patient: { userId: 'u-1' },
        prescriptionMedications: [
          {
            id: 'pm-10',
            pharmacyId: 'pharmacy-ext-1',
            isHospitalMed: false,
            dispenseStatus: 'FULFILLED',
          },
        ],
      });

      await expect(
        service.processExternalFulfillment({
          ...webhookDto,
          status: FulfillmentStatus.PARTIALLY_FULFILLED,
        }),
      ).rejects.toThrow(ConflictException);
      expect(
        prismaMock.prescriptionMedication.updateMany,
      ).not.toHaveBeenCalled();
    });
  });
});
