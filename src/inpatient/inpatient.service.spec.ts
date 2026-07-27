import { Test, TestingModule } from '@nestjs/testing';
import { InpatientService } from './inpatient.service';
import { PrismaService } from '../prisma/prisma.service';
import { BedStatus, AdmissionStatus } from '@prisma/client';
import { ConflictException, ForbiddenException, BadRequestException, NotFoundException } from '@nestjs/common';

describe('InpatientService', () => {
  let service: InpatientService;
  let prisma: PrismaService;

  const mockPrismaService = {
    $transaction: jest.fn((callback) => callback(mockPrismaService)),
    hospitalStaff: { findFirst: jest.fn() },
    doctor: { findFirst: jest.fn() },
    hospital: { findFirst: jest.fn(), findUnique: jest.fn() },
    patient: { findUnique: jest.fn() },
    inpatientAdmission: { findFirst: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
    bed: { findUnique: jest.fn(), update: jest.fn() },
    bedTransfer: { create: jest.fn() },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InpatientService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<InpatientService>(InpatientService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createAdmission', () => {
    const dto = { patientId: 'p-1', hospitalId: 'h-1', reason: 'Fever', bedId: 'bed-1', wardName: 'General', bedNumber: '101' };

    it('should throw ForbiddenException if admitter hospital does not match target hospital', async () => {
      mockPrismaService.doctor.findFirst.mockResolvedValue({ hospitalId: 'h-2', firstName: 'John' });

      await expect(service.createAdmission('doc-1', 'DOCTOR', dto)).rejects.toThrow(ForbiddenException);
    });

    it('should throw BadRequestException if bed is not available', async () => {
      mockPrismaService.doctor.findFirst.mockResolvedValue({ hospitalId: 'h-1', firstName: 'John' });
      mockPrismaService.patient.findUnique.mockResolvedValue({ id: 'p-1' });
      mockPrismaService.hospital.findUnique.mockResolvedValue({ id: 'h-1' });
      mockPrismaService.inpatientAdmission.findFirst.mockResolvedValue(null);
      mockPrismaService.bed.findUnique.mockResolvedValue({ id: 'bed-1', status: BedStatus.OCCUPIED });

      await expect(service.createAdmission('doc-1', 'DOCTOR', dto)).rejects.toThrow(BadRequestException);
    });

    it('should create admission and update bed status in a transaction', async () => {
      mockPrismaService.doctor.findFirst.mockResolvedValue({ hospitalId: 'h-1', firstName: 'John' });
      mockPrismaService.patient.findUnique.mockResolvedValue({ id: 'p-1' });
      mockPrismaService.hospital.findUnique.mockResolvedValue({ id: 'h-1' });
      mockPrismaService.inpatientAdmission.findFirst.mockResolvedValue(null);
      mockPrismaService.bed.findUnique.mockResolvedValue({ id: 'bed-1', status: BedStatus.AVAILABLE });
      mockPrismaService.inpatientAdmission.create.mockResolvedValue({ id: 'adm-1' });

      const result = await service.createAdmission('doc-1', 'DOCTOR', dto);

      expect(prisma.$transaction).toHaveBeenCalled();
      expect(prisma.inpatientAdmission.create).toHaveBeenCalled();
      expect(prisma.bed.update).toHaveBeenCalledWith({
        where: { id: 'bed-1' },
        data: { status: BedStatus.OCCUPIED, isOccupied: true },
      });
      expect(result).toEqual({ id: 'adm-1' });
    });
  });

  describe('dischargeAdmission', () => {
    const dto = { clinicalClearance: true, billingClearance: true, notes: 'Ready to go' };

    it('should throw BadRequestException if clearances are missing', async () => {
      mockPrismaService.doctor.findFirst.mockResolvedValue({ hospitalId: 'h-1' });
      mockPrismaService.inpatientAdmission.findUnique.mockResolvedValue({
        id: 'adm-1', hospitalId: 'h-1', status: 'ACTIVE', clinicalCleared: false, billingCleared: false 
      });

      await expect(service.dischargeAdmission('adm-1', 'doc-1', 'DOCTOR', { clinicalClearance: false, billingClearance: false }))
        .rejects.toThrow(BadRequestException);
    });

    it('should discharge patient and set bed to CLEANING', async () => {
      mockPrismaService.doctor.findFirst.mockResolvedValue({ hospitalId: 'h-1' });
      mockPrismaService.inpatientAdmission.findUnique.mockResolvedValue({
        id: 'adm-1', hospitalId: 'h-1', status: 'ACTIVE', bedId: 'bed-1'
      });
      mockPrismaService.inpatientAdmission.update.mockResolvedValue({ id: 'adm-1', status: 'DISCHARGED' });

      const result = await service.dischargeAdmission('adm-1', 'doc-1', 'DOCTOR', dto);

      expect(prisma.inpatientAdmission.update).toHaveBeenCalledWith({
        where: { id: 'adm-1' },
        data: expect.objectContaining({ status: 'DISCHARGED', clinicalCleared: true, billingCleared: true }),
        include: { patient: { select: { id: true, firstName: true, lastName: true } } }
      });
      expect(prisma.bed.update).toHaveBeenCalledWith({
        where: { id: 'bed-1' },
        data: { status: BedStatus.CLEANING, isOccupied: false },
      });
      expect(result).toEqual({ id: 'adm-1', status: 'DISCHARGED' });
    });
  });

  describe('transferBed', () => {
    const dto = { targetBedId: 'bed-2', reason: 'Patient requested' };

    it('should successfully transfer bed and create audit log', async () => {
      mockPrismaService.inpatientAdmission.findUnique.mockResolvedValue({
        id: 'adm-1', status: AdmissionStatus.ACTIVE, bedId: 'bed-1'
      });
      mockPrismaService.bed.findUnique.mockResolvedValue({
        id: 'bed-2', status: BedStatus.AVAILABLE, isOccupied: false, number: '102'
      });

      await service.transferBed('adm-1', 'user-1', dto);

      expect(prisma.bed.update).toHaveBeenCalledWith({
        where: { id: 'bed-1' },
        data: { status: BedStatus.AVAILABLE, isOccupied: false }
      });
      expect(prisma.bed.update).toHaveBeenCalledWith({
        where: { id: 'bed-2' },
        data: { status: BedStatus.OCCUPIED, isOccupied: true }
      });
      expect(prisma.bedTransfer.create).toHaveBeenCalledWith({
        data: {
          admissionId: 'adm-1',
          fromBedId: 'bed-1',
          toBedId: 'bed-2',
          transferredByUserId: 'user-1',
          reason: dto.reason
        }
      });
    });
  });
});