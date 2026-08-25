import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  AdmissionStatus,
  BedStatus,
  HospitalBillingStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { InpatientService } from './inpatient.service';

describe('InpatientService', () => {
  let service: InpatientService;

  const mockPrismaService = {
    $queryRaw: jest.fn(),
    $transaction: jest.fn(),
    hospitalStaff: { findFirst: jest.fn() },
    doctor: { findFirst: jest.fn() },
    hospital: { findFirst: jest.fn(), findUnique: jest.fn() },
    patient: { findUnique: jest.fn() },
    inpatientAdmission: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    bed: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    bedTransfer: { create: jest.fn() },
    ward: { findMany: jest.fn() },
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    mockPrismaService.$transaction.mockImplementation(
      (callback: (tx: typeof mockPrismaService) => unknown) =>
        callback(mockPrismaService),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InpatientService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<InpatientService>(InpatientService);
  });

  const mockDoctor = (hospitalId = 'h-1') => {
    mockPrismaService.doctor.findFirst.mockResolvedValue({
      hospitalId,
      firstName: 'John',
      lastName: 'Doe',
    });
  };

  const mockNurse = (hospitalId = 'h-1') => {
    mockPrismaService.hospitalStaff.findFirst.mockResolvedValue({
      id: 'staff-1',
      hospitalId,
      firstName: 'Jane',
      lastName: 'Doe',
    });
  };

  describe('createAdmission', () => {
    const dto = {
      patientId: 'p-1',
      hospitalId: 'h-1',
      reason: 'Fever',
      bedId: 'bed-1',
      wardId: 'ward-1',
      roomId: 'room-1',
    };
    const availableBed = {
      id: 'bed-1',
      number: '101',
      wardId: 'ward-1',
      roomId: 'room-1',
      status: BedStatus.AVAILABLE,
      isOccupied: false,
      ward: { name: 'General' },
    };

    const mockAdmissionDependencies = () => {
      mockDoctor();
      mockPrismaService.patient.findUnique.mockResolvedValue({ id: 'p-1' });
      mockPrismaService.hospital.findUnique.mockResolvedValue({ id: 'h-1' });
      mockPrismaService.inpatientAdmission.findFirst.mockResolvedValue(null);
    };

    it('rejects admission into another hospital', async () => {
      mockDoctor('h-2');

      await expect(
        service.createAdmission('doc-1', 'DOCTOR', dto),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects a bed outside the admitting hospital', async () => {
      mockAdmissionDependencies();
      mockPrismaService.bed.findFirst.mockResolvedValue(null);

      await expect(
        service.createAdmission('doc-1', 'DOCTOR', dto),
      ).rejects.toThrow(NotFoundException);

      expect(mockPrismaService.bed.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            id: 'bed-1',
            ward: { hospitalId: 'h-1' },
          },
        }),
      );
      expect(mockPrismaService.bed.updateMany).not.toHaveBeenCalled();
    });

    it('rejects a supplied ward or room that does not own the bed', async () => {
      mockAdmissionDependencies();
      mockPrismaService.bed.findFirst.mockResolvedValue({
        ...availableBed,
        roomId: 'other-room',
      });

      await expect(
        service.createAdmission('doc-1', 'DOCTOR', dto),
      ).rejects.toThrow(BadRequestException);
      expect(mockPrismaService.bed.updateMany).not.toHaveBeenCalled();
    });

    it('fails when the conditional bed claim loses a race', async () => {
      mockAdmissionDependencies();
      mockPrismaService.bed.findFirst.mockResolvedValue(availableBed);
      mockPrismaService.bed.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.createAdmission('doc-1', 'DOCTOR', dto),
      ).rejects.toThrow(ConflictException);
      expect(
        mockPrismaService.inpatientAdmission.create,
      ).not.toHaveBeenCalled();
    });

    it('claims the bed and normalizes ward and bed labels atomically', async () => {
      mockAdmissionDependencies();
      mockPrismaService.bed.findFirst.mockResolvedValue(availableBed);
      mockPrismaService.bed.updateMany.mockResolvedValue({ count: 1 });
      mockPrismaService.inpatientAdmission.create.mockResolvedValue({
        id: 'adm-1',
      });

      const result = await service.createAdmission('doc-1', 'DOCTOR', dto);

      expect(mockPrismaService.$transaction).toHaveBeenCalledTimes(1);
      expect(mockPrismaService.bed.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'bed-1',
          status: BedStatus.AVAILABLE,
          isOccupied: false,
        },
        data: {
          status: BedStatus.OCCUPIED,
          isOccupied: true,
          statusNotes: null,
        },
      });
      expect(mockPrismaService.inpatientAdmission.create).toHaveBeenCalledWith(
        expect.objectContaining({
          // Jest asymmetric matchers are intentionally untyped test values.
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          data: expect.objectContaining({
            bedId: 'bed-1',
            bedNumber: '101',
            wardName: 'General',
          }),
        }),
      );
      expect(result).toEqual({ id: 'adm-1' });
    });
  });

  describe('clinical clearance and discharge', () => {
    it('allows only a doctor to grant clinical clearance', async () => {
      await expect(
        service.grantClinicalClearance('adm-1', 'nurse-1', 'NURSE'),
      ).rejects.toThrow(ForbiddenException);
      expect(
        mockPrismaService.inpatientAdmission.update,
      ).not.toHaveBeenCalled();
    });

    it('records clinical clearance for an active same-hospital admission', async () => {
      mockDoctor();
      mockPrismaService.inpatientAdmission.findUnique.mockResolvedValue({
        id: 'adm-1',
        hospitalId: 'h-1',
        status: AdmissionStatus.ACTIVE,
      });
      mockPrismaService.inpatientAdmission.update.mockResolvedValue({
        id: 'adm-1',
        clinicalCleared: true,
      });

      const result = await service.grantClinicalClearance(
        'adm-1',
        'doc-1',
        'DOCTOR',
      );

      expect(mockPrismaService.inpatientAdmission.update).toHaveBeenCalledWith({
        where: { id: 'adm-1' },
        data: { clinicalCleared: true },
      });
      expect(result).toEqual({ id: 'adm-1', clinicalCleared: true });
    });

    it('rejects discharge until clinical clearance is persisted', async () => {
      mockDoctor();
      mockPrismaService.inpatientAdmission.findUnique.mockResolvedValue({
        id: 'adm-1',
        hospitalId: 'h-1',
        status: AdmissionStatus.ACTIVE,
        clinicalCleared: false,
        hospitalInvoice: null,
      });

      await expect(
        service.dischargeAdmission('adm-1', 'doc-1', 'DOCTOR', {}),
      ).rejects.toThrow(BadRequestException);
      expect(
        mockPrismaService.inpatientAdmission.updateMany,
      ).not.toHaveBeenCalled();
    });

    it('rejects discharge while the linked invoice is unpaid', async () => {
      mockDoctor();
      mockPrismaService.inpatientAdmission.findUnique.mockResolvedValue({
        id: 'adm-1',
        hospitalId: 'h-1',
        status: AdmissionStatus.ACTIVE,
        clinicalCleared: true,
        hospitalInvoice: { paymentStatus: HospitalBillingStatus.UNPAID },
      });

      await expect(
        service.dischargeAdmission('adm-1', 'doc-1', 'DOCTOR', {}),
      ).rejects.toThrow(BadRequestException);
      expect(
        mockPrismaService.inpatientAdmission.updateMany,
      ).not.toHaveBeenCalled();
    });

    it('discharges a cleared patient and sends the bed to cleaning', async () => {
      mockDoctor();
      mockPrismaService.inpatientAdmission.findUnique
        .mockResolvedValueOnce({
          id: 'adm-1',
          hospitalId: 'h-1',
          status: AdmissionStatus.ACTIVE,
          clinicalCleared: true,
          bedId: 'bed-1',
          hospitalInvoice: { paymentStatus: HospitalBillingStatus.PAID },
        })
        .mockResolvedValueOnce({
          id: 'adm-1',
          status: AdmissionStatus.DISCHARGED,
        });
      mockPrismaService.inpatientAdmission.updateMany.mockResolvedValue({
        count: 1,
      });
      mockPrismaService.bed.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.dischargeAdmission(
        'adm-1',
        'doc-1',
        'DOCTOR',
        { notes: 'Ready to go' },
      );

      expect(
        mockPrismaService.inpatientAdmission.updateMany,
      ).toHaveBeenCalledWith({
        where: { id: 'adm-1', status: AdmissionStatus.ACTIVE },
        // Jest asymmetric matchers are intentionally untyped test values.
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        data: expect.objectContaining({
          status: AdmissionStatus.DISCHARGED,
          billingCleared: true,
          dischargeNotes: 'Ready to go',
          dischargedByUserId: 'doc-1',
        }),
      });
      expect(mockPrismaService.bed.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'bed-1',
          status: BedStatus.OCCUPIED,
          isOccupied: true,
        },
        data: {
          status: BedStatus.CLEANING,
          isOccupied: false,
          statusNotes: 'Awaiting cleaning after patient discharge',
        },
      });
      expect(result).toEqual({
        id: 'adm-1',
        status: AdmissionStatus.DISCHARGED,
      });
    });

    it('does not let a hospital admin author clinical discharge notes', async () => {
      mockPrismaService.hospital.findFirst.mockResolvedValue({
        id: 'h-1',
        name: 'Hospital One',
      });
      mockPrismaService.inpatientAdmission.findUnique.mockResolvedValue({
        id: 'adm-1',
        hospitalId: 'h-1',
        status: AdmissionStatus.ACTIVE,
        clinicalCleared: true,
        hospitalInvoice: null,
      });

      await expect(
        service.dischargeAdmission('adm-1', 'admin-1', 'HOSPITAL_ADMIN', {
          notes: 'Continue medication',
        }),
      ).rejects.toThrow(ForbiddenException);
      expect(
        mockPrismaService.inpatientAdmission.updateMany,
      ).not.toHaveBeenCalled();
    });
  });

  describe('updateBedStatus', () => {
    it('does not reveal or update a bed in another hospital', async () => {
      mockNurse();
      mockPrismaService.bed.findFirst.mockResolvedValue(null);

      await expect(
        service.updateBedStatus('nurse-1', 'NURSE', 'bed-other', {
          status: BedStatus.MAINTENANCE,
        }),
      ).rejects.toThrow(NotFoundException);
      expect(mockPrismaService.bed.update).not.toHaveBeenCalled();
    });

    it('prevents manual status changes while a bed has an active admission', async () => {
      mockNurse();
      mockPrismaService.bed.findFirst.mockResolvedValue({
        id: 'bed-1',
        inpatientAdmissions: [{ id: 'adm-1' }],
      });

      await expect(
        service.updateBedStatus('nurse-1', 'NURSE', 'bed-1', {
          status: BedStatus.MAINTENANCE,
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('prevents setting a free bed to occupied outside an admission flow', async () => {
      mockNurse();
      mockPrismaService.bed.findFirst.mockResolvedValue({
        id: 'bed-1',
        inpatientAdmissions: [],
      });

      await expect(
        service.updateBedStatus('nurse-1', 'NURSE', 'bed-1', {
          status: BedStatus.OCCUPIED,
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('clears stale notes when a free bed changes status without new notes', async () => {
      mockNurse();
      mockPrismaService.bed.findFirst.mockResolvedValue({
        id: 'bed-1',
        inpatientAdmissions: [],
      });
      mockPrismaService.bed.update.mockResolvedValue({
        id: 'bed-1',
        status: BedStatus.AVAILABLE,
        statusNotes: null,
      });

      await service.updateBedStatus('nurse-1', 'NURSE', 'bed-1', {
        status: BedStatus.AVAILABLE,
      });

      expect(mockPrismaService.bed.update).toHaveBeenCalledWith({
        where: { id: 'bed-1' },
        data: {
          status: BedStatus.AVAILABLE,
          isOccupied: false,
          statusNotes: null,
        },
      });
    });
  });

  describe('transferBed', () => {
    const dto = { targetBedId: 'bed-2', reason: 'Patient requested' };
    const admission = {
      id: 'adm-1',
      hospitalId: 'h-1',
      status: AdmissionStatus.ACTIVE,
      bedId: 'bed-1',
    };
    const targetBed = {
      id: 'bed-2',
      number: '102',
      status: BedStatus.AVAILABLE,
      isOccupied: false,
      statusNotes: null,
      ward: { name: 'Surgical' },
    };

    const mockTransferDependencies = () => {
      mockDoctor();
      mockPrismaService.inpatientAdmission.findUnique.mockResolvedValue(
        admission,
      );
    };

    it('rejects a target bed outside the admission hospital', async () => {
      mockTransferDependencies();
      mockPrismaService.bed.findFirst.mockResolvedValue(null);

      await expect(
        service.transferBed('adm-1', 'doc-1', 'DOCTOR', dto),
      ).rejects.toThrow(NotFoundException);
      expect(mockPrismaService.bed.updateMany).not.toHaveBeenCalled();
    });

    it('fails when the conditional target-bed claim loses a race', async () => {
      mockTransferDependencies();
      mockPrismaService.bed.findFirst.mockResolvedValue(targetBed);
      mockPrismaService.bed.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.transferBed('adm-1', 'doc-1', 'DOCTOR', dto),
      ).rejects.toThrow(ConflictException);
      expect(mockPrismaService.bedTransfer.create).not.toHaveBeenCalled();
    });

    it('claims the target, cleans the old bed, and records the transfer', async () => {
      mockTransferDependencies();
      mockPrismaService.bed.findFirst.mockResolvedValue(targetBed);
      mockPrismaService.bed.updateMany
        .mockResolvedValueOnce({ count: 1 })
        .mockResolvedValueOnce({ count: 1 });
      mockPrismaService.inpatientAdmission.updateMany.mockResolvedValue({
        count: 1,
      });
      mockPrismaService.bedTransfer.create.mockResolvedValue({
        id: 'transfer-1',
      });

      const result = await service.transferBed('adm-1', 'doc-1', 'DOCTOR', dto);

      expect(mockPrismaService.bed.updateMany).toHaveBeenNthCalledWith(1, {
        where: {
          id: 'bed-2',
          status: BedStatus.AVAILABLE,
          isOccupied: false,
        },
        data: {
          status: BedStatus.OCCUPIED,
          isOccupied: true,
          statusNotes: null,
        },
      });
      expect(mockPrismaService.bed.updateMany).toHaveBeenNthCalledWith(2, {
        where: {
          id: 'bed-1',
          status: BedStatus.OCCUPIED,
          isOccupied: true,
        },
        data: {
          status: BedStatus.CLEANING,
          isOccupied: false,
          statusNotes: 'Awaiting cleaning after patient transfer',
        },
      });
      expect(
        mockPrismaService.inpatientAdmission.updateMany,
      ).toHaveBeenCalledWith({
        where: {
          id: 'adm-1',
          status: AdmissionStatus.ACTIVE,
          bedId: 'bed-1',
        },
        data: {
          bedId: 'bed-2',
          wardName: 'Surgical',
          bedNumber: '102',
        },
      });
      expect(mockPrismaService.bedTransfer.create).toHaveBeenCalledWith({
        data: {
          admissionId: 'adm-1',
          fromBedId: 'bed-1',
          toBedId: 'bed-2',
          transferredByUserId: 'doc-1',
          reason: dto.reason,
        },
      });
      expect(result.newBed).toEqual(
        expect.objectContaining({
          id: 'bed-2',
          status: BedStatus.OCCUPIED,
          isOccupied: true,
        }),
      );
    });
  });

  describe('getHospitalOccupancyOverview', () => {
    it('rejects occupancy access for another hospital', async () => {
      mockDoctor('h-2');

      await expect(
        service.getHospitalOccupancyOverview('doc-1', 'DOCTOR', 'h-1'),
      ).rejects.toThrow(ForbiddenException);
      expect(mockPrismaService.ward.findMany).not.toHaveBeenCalled();
    });

    it('counts each bed lifecycle state exactly', async () => {
      mockDoctor();
      mockPrismaService.ward.findMany.mockResolvedValue([
        {
          id: 'ward-1',
          name: 'General',
          tier: 'STANDARD',
          beds: [
            { id: 'b-1', status: BedStatus.AVAILABLE },
            { id: 'b-2', status: BedStatus.OCCUPIED },
            { id: 'b-3', status: BedStatus.MAINTENANCE },
            { id: 'b-4', status: BedStatus.CLEANING },
          ],
        },
      ]);

      const result = await service.getHospitalOccupancyOverview(
        'doc-1',
        'DOCTOR',
        'h-1',
      );

      expect(result.summary).toEqual({
        totalBeds: 4,
        occupiedBeds: 1,
        availableBeds: 1,
        maintenanceBeds: 1,
        cleaningBeds: 1,
        overallOccupancyRate: 25,
      });
      expect(result.wards[0].stats).toEqual({
        total: 4,
        occupied: 1,
        available: 1,
        maintenance: 1,
        cleaning: 1,
        occupancyRate: 25,
      });
    });
  });
});
