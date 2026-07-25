// backend/src/diagnostics/diagnostics.service.ts

import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { CreateDiagnosticOrderDto, UpdateDiagnosticOrderFindingsDto } from './dto';
import { DiagnosticStatus, DiagnosticType, NotificationType, UserRole } from '@prisma/client';

@Injectable()
export class DiagnosticsService {
  constructor(
    private prisma: PrismaService,
    private notificationsService: NotificationsService,
    private eventEmitter: EventEmitter2,
  ) {}

  // 1. Doctor requests a diagnostic test
  async create(userSubId: string, dto: CreateDiagnosticOrderDto) {
    // Confirm the doctor profile exists
    const doctor = await this.prisma.doctor.findUnique({
      where: { userId: userSubId },
    });
    if (!doctor) {
      throw new NotFoundException('Doctor profile not found for this user');
    }

    // Confirm patient exists
    const patient = await this.prisma.patient.findUnique({
      where: { id: dto.patientId },
    });
    if (!patient) {
      throw new NotFoundException('Patient not found');
    }

    // If appointment is linked, verify it exists
    if (dto.appointmentId) {
      const appointment = await this.prisma.appointment.findUnique({
        where: { id: dto.appointmentId },
      });
      if (!appointment) {
        throw new NotFoundException('Linked appointment not found');
      }
    }

    // Create the order
    return this.prisma.diagnosticOrder.create({
      data: {
        patientId: dto.patientId,
        doctorId: doctor.id,
        appointmentId: dto.appointmentId || null,
        testType: dto.testType,
        icd10Code: dto.icd10Code,
        status: DiagnosticStatus.PENDING,
      },
      include: {
        patient: true,
        doctor: true,
      },
    });
  }


  // 2. Technicians view the queue of requests
  async getQueue(status?: DiagnosticStatus) {
    return this.prisma.diagnosticOrder.findMany({
      where: status ? { status } : {},
      include: {
        patient: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            mrn: true,
            phone: true,
          },
        },
        doctor: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            licenseNumber: true,
            specialization: true,
          },
        },
        appointment: {
          select: {
            id: true,
            date: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // 3. View patient diagnostic history
  async getPatientHistory(patientId: string) {
    // Confirm patient exists
    const patient = await this.prisma.patient.findUnique({
      where: { id: patientId },
    });
    if (!patient) {
      throw new NotFoundException('Patient not found');
    }

    return this.prisma.diagnosticOrder.findMany({
      where: { patientId },
      include: {
        doctor: {
          select: {
            firstName: true,
            lastName: true,
            specialization: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // 4. Technician logs findings and finishes results
  async updateFindings(
    id: string,
    technicianSubId: string,
    dto: UpdateDiagnosticOrderFindingsDto,
  ) {
    const order = await this.prisma.diagnosticOrder.findUnique({
      where: { id },
      include: {
        patient: true,
        doctor: true,
      },
    });
    if (!order) {
      throw new NotFoundException('Diagnostic order not found');
    }

    const previousStatus = order.status;
    const isCompleted = dto.status === DiagnosticStatus.COMPLETED;

    const updatedOrder = await this.prisma.diagnosticOrder.update({
      where: { id },
      data: {
        status: dto.status ?? order.status,
        findings: dto.findings ?? order.findings,
        resultValue: dto.resultValue ?? order.resultValue,
        fileUrl: dto.fileUrl ?? order.fileUrl,
        fileName: dto.fileName ?? order.fileName,
        fileType: dto.fileType ?? order.fileType,
        technicianId: technicianSubId,
        completedAt: isCompleted ? new Date() : order.completedAt,
      },
      include: {
        patient: true,
        doctor: true,
      },
    });

    // Trigger notification if newly marked COMPLETED
    if (isCompleted && previousStatus !== DiagnosticStatus.COMPLETED) {
      // Find the Doctor's user account to send socket message
      const doctorUser = await this.prisma.doctor.findUnique({
        where: { id: order.doctorId },
        select: { userId: true },
      });

      if (doctorUser) {
        await this.notificationsService.create({
          userId: doctorUser.userId,
          type: NotificationType.CONSULTATION_COMPLETED,
          title: 'Diagnostic Results Finalized',
          message: `The diagnostic order for ${order.testType} for patient ${order.patient.firstName} ${order.patient.lastName} has been finalized by the laboratory.`,
        });
      }

      // Emit event to trigger background inventory deduction
            this.eventEmitter.emit('diagnostic.completed', {
              orderId: order.id,
            });
          }

    return updatedOrder;
  }

  // 5. Generate secure pre-signed S3 URL for authorized personnel
  async getSecureFileUrl(id: string, userSubId: string) {
    const order = await this.prisma.diagnosticOrder.findUnique({
      where: { id },
    });
    if (!order) {
      throw new NotFoundException('Diagnostic order not found');
    }
    if (!order.fileUrl) {
      throw new NotFoundException('No file has been uploaded for this diagnostic order yet');
    }

    // Retrieve the user requesting
    const user = await this.prisma.user.findUnique({
      where: { id: userSubId },
    });
    if (!user) {
      throw new NotFoundException('User profile not found');
    }

    let isAuthorized = false;

    // Check doctor authorization
    if (user.role === UserRole.DOCTOR) {
      const doctor = await this.prisma.doctor.findUnique({
        where: { userId: userSubId },
      });
      if (doctor && doctor.id === order.doctorId) {
        isAuthorized = true;
      }
    }
    // Check patient authorization
    else if (user.role === UserRole.PATIENT) {
      const patient = await this.prisma.patient.findUnique({
        where: { userId: userSubId },
      });
      if (patient && patient.id === order.patientId) {
        isAuthorized = true;
      }
    }
    // Check technician, admin, nurse authorization (hospital roles)
    else if (
      user.role === UserRole.TECHNICIAN ||
      user.role === UserRole.HOSPITAL_ADMIN ||
      user.role === UserRole.NURSE ||
      user.role === UserRole.SUPER_ADMIN
    ) {
      isAuthorized = true;
    }

    if (!isAuthorized) {
      throw new ForbiddenException(
        'You are not authorized to access this diagnostic file report',
      );
    }

    // TODO: DO NOT USE IN PRODUCTION! This is a mock pre-signed S3 URL for testing.
    // Replace with real AWS SDK call to generate pre-signed URL before deploying to production.
    const expiresSeconds = Math.round((Date.now() + 15 * 60 * 1000) / 1000);
    const mockS3Url = `https://e-vuze-medical-records.s3.amazonaws.com/diagnostics/${order.id}?AWSAccessKeyId=AKIAIOSFODNN7EXAMPLE&Signature=vjbyPxybdZaNmGa%2ByT272YEAiv4%3D&Expires=${expiresSeconds}`;

    return {
      secureUrl: mockS3Url,
      fileName: order.fileName,
      fileType: order.fileType,
      expiresAt: new Date(expiresSeconds * 1000).toISOString(),
    };
  }
}
