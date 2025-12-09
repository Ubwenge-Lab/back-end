// backend/src/prescriptions/prescriptions.service.ts

import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PatientsService } from '../patients/patients.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreatePrescriptionDto, UpdatePrescriptionStatusDto } from './dto';

@Injectable()
export class PrescriptionsService {
  constructor(
    private prisma: PrismaService,
    private patientsService: PatientsService,
    private notificationsService: NotificationsService,
  ) {}

  async create(userId: string, dto: CreatePrescriptionDto) {
    const patient = await this.patientsService.findByUserId(userId);

    const prescription = await this.prisma.prescription.create({
      data: {
        patientId: patient.id,
        ...dto,
      },
    });

    return prescription;
  }

  async findById(id: string) {
    const prescription = await this.prisma.prescription.findUnique({
      where: { id },
      include: {
        patient: {
          include: {
            user: {
              select: { email: true },
            },
          },
        },
      },
    });

    if (!prescription) {
      throw new NotFoundException('Prescription not found');
    }

    return prescription;
  }

  async findByPatient(userId: string) {
    const patient = await this.patientsService.findByUserId(userId);

    return this.prisma.prescription.findMany({
      where: { patientId: patient.id },
      orderBy: { createdAt: 'desc' },
    });
  }

  // Pharmacy reviews and approves/rejects prescription
  async updateStatus(id: string, dto: UpdatePrescriptionStatusDto) {
    const prescription = await this.findById(id);

    const updated = await this.prisma.prescription.update({
      where: { id },
      data: {
        status: dto.status,
        rejectionReason: dto.rejectionReason,
        reviewedAt: new Date(),
      },
    });

    // Notify patient
    if (dto.status === 'REJECTED') {
      await this.notificationsService.create({
        patientId: prescription.patientId,
        type: 'PRESCRIPTION_REJECTED',
        title: 'Prescription Rejected',
        message: dto.rejectionReason || 'Your prescription was rejected by the pharmacy.',
      });
    }

    return updated;
  }
}
