import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { LabResultsService } from './lab-results.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuditService } from '../audit/audit.service';
import { DiagnosticStatus, DiagnosticType, TechnicianSpecialization } from '@prisma/client';

const PDF_BUFFER = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.from('body')]);
const SCRIPT_BUFFER = Buffer.from('#!/bin/sh\n');

function makeFile(overrides: Partial<any> = {}) {
  return {
    fieldname: 'file',
    originalname: 'result.pdf',
    encoding: '7bit',
    mimetype: 'application/pdf',
    size: PDF_BUFFER.length,
    buffer: PDF_BUFFER,
    ...overrides,
  };
}

describe('LabResultsService', () => {
  let service: LabResultsService;
  let prisma: any;
  let notifications: any;
  let audit: any;

  const labStaff = {
    id: 'staff-1',
    userId: 'user-tech-1',
    hospitalId: 'hospital-1',
    technicianSpecialization: TechnicianSpecialization.LAB,
  };

  beforeEach(async () => {
    prisma = {
      hospitalStaff: { findUnique: jest.fn() },
      patient: { findFirst: jest.fn() },
      diagnosticOrder: { findFirst: jest.fn(), findUnique: jest.fn(), update: jest.fn(), findMany: jest.fn() },
      labResultRevision: { create: jest.fn() },
    };
    notifications = { create: jest.fn() };
    audit = { log: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LabResultsService,
        { provide: PrismaService, useValue: prisma },
        { provide: NotificationsService, useValue: notifications },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();

    service = module.get<LabResultsService>(LabResultsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('access control', () => {
    it('rejects a technician with no staff profile', async () => {
      prisma.hospitalStaff.findUnique.mockResolvedValue(null);
      await expect(service.getQueue('user-x')).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('rejects a radiology technician from lab-only endpoints', async () => {
      prisma.hospitalStaff.findUnique.mockResolvedValue({
        ...labStaff,
        technicianSpecialization: TechnicianSpecialization.RADIOLOGY,
      });
      await expect(service.getQueue('user-tech-1')).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('uploadResult', () => {
    const patient = { id: 'patient-1', userId: 'user-patient-1', firstName: 'Jane', lastName: 'Doe', mrn: 'MRN123' };
    const doctor = { id: 'doctor-1', userId: 'user-doctor-1', hospitalId: 'hospital-1' };

    beforeEach(() => {
      prisma.hospitalStaff.findUnique.mockResolvedValue(labStaff);
      prisma.patient.findFirst.mockResolvedValue(patient);
    });

    it('rejects a file whose content does not match its declared mimetype', async () => {
      const badFile = makeFile({ buffer: SCRIPT_BUFFER, size: SCRIPT_BUFFER.length });
      await expect(
        service.uploadResult('user-tech-1', { mrn: 'MRN123', appointmentId: 'appt-1' }, badFile),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects files over the 10MB limit', async () => {
      const bigFile = makeFile({ size: 11 * 1024 * 1024 });
      await expect(
        service.uploadResult('user-tech-1', { mrn: 'MRN123', appointmentId: 'appt-1' }, bigFile),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws NotFoundException when no matching lab order exists', async () => {
      prisma.diagnosticOrder.findFirst.mockResolvedValue(null);
      await expect(
        service.uploadResult('user-tech-1', { mrn: 'MRN123', appointmentId: 'appt-1' }, makeFile()),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('requires a correctionReason when re-uploading over an existing result', async () => {
      prisma.diagnosticOrder.findFirst.mockResolvedValue({
        id: 'order-1',
        patient,
        doctor,
        status: DiagnosticStatus.COMPLETED,
        testType: DiagnosticType.BLOOD,
        fileUrl: 'already-has-a-result',
      });
      await expect(
        service.uploadResult('user-tech-1', { mrn: 'MRN123', appointmentId: 'appt-1' }, makeFile()),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('snapshots the previous result into a LabResultRevision on correction, and notifies both doctor and patient', async () => {
      const existingOrder = {
        id: 'order-1',
        patient,
        doctor,
        status: DiagnosticStatus.COMPLETED,
        testType: DiagnosticType.BLOOD,
        fileUrl: 'old-encrypted-file',
        fileName: 'old.pdf',
        fileType: 'application/pdf',
        findings: null,
        resultValue: null,
        structuredResult: null,
      };
      prisma.diagnosticOrder.findFirst.mockResolvedValue(existingOrder);
      prisma.diagnosticOrder.update.mockResolvedValue({ ...existingOrder, status: DiagnosticStatus.COMPLETED });

      await service.uploadResult(
        'user-tech-1',
        { mrn: 'MRN123', appointmentId: 'appt-1', correctionReason: 'Wrong file attached originally' },
        makeFile(),
      );

      expect(prisma.labResultRevision.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            diagnosticOrderId: 'order-1',
            fileUrl: 'old-encrypted-file',
            correctionReason: 'Wrong file attached originally',
          }),
        }),
      );
      expect(notifications.create).toHaveBeenCalledWith(
        expect.objectContaining({ userId: doctor.userId }),
      );
      expect(notifications.create).toHaveBeenCalledWith(
        expect.objectContaining({ userId: patient.userId }),
      );
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'LAB_RESULT_CORRECTED' }),
      );
    });
  });

  describe('rejectOrder', () => {
    it('refuses to reject an already-completed order', async () => {
      prisma.hospitalStaff.findUnique.mockResolvedValue(labStaff);
      prisma.diagnosticOrder.findUnique.mockResolvedValue({
        id: 'order-1',
        testType: DiagnosticType.BLOOD,
        status: DiagnosticStatus.COMPLETED,
        doctor: { hospitalId: 'hospital-1' },
        patient: {},
      });
      await expect(
        service.rejectOrder('user-tech-1', 'order-1', { reason: 'Sample contaminated' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('refuses to act on an order belonging to a different hospital', async () => {
      prisma.hospitalStaff.findUnique.mockResolvedValue(labStaff);
      prisma.diagnosticOrder.findUnique.mockResolvedValue({
        id: 'order-1',
        testType: DiagnosticType.BLOOD,
        status: DiagnosticStatus.PENDING,
        doctor: { hospitalId: 'some-other-hospital' },
        patient: {},
      });
      await expect(
        service.rejectOrder('user-tech-1', 'order-1', { reason: 'Sample contaminated' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('updateStatus', () => {
    it('rejects invalid status transitions (e.g. skipping straight to IN_PROGRESS from PENDING)', async () => {
      prisma.hospitalStaff.findUnique.mockResolvedValue(labStaff);
      prisma.diagnosticOrder.findUnique.mockResolvedValue({
        id: 'order-1',
        testType: DiagnosticType.BLOOD,
        status: DiagnosticStatus.PENDING,
        doctor: { hospitalId: 'hospital-1' },
        patient: {},
      });
      await expect(
        service.updateStatus('user-tech-1', 'order-1', { status: DiagnosticStatus.IN_PROGRESS }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
