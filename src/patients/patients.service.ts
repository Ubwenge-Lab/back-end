// backend/src/patients/patients.service.ts

import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdatePatientDto } from './dto/update-patient.dto';

@Injectable()
export class PatientsService {
  constructor(private prisma: PrismaService) {}

  // ========================================
  // FIND PATIENT BY USER ID
  // ========================================

  async findByUserId(userId: string) {
    const patient = await this.prisma.patient.findUnique({
      where: { userId },
    });

    if (!patient) {
      throw new NotFoundException('Patient not found');
    }

    return patient;
  }

  // ========================================
  // FIND PATIENT BY ID
  // ========================================

  async findById(id: string) {
    const patient = await this.prisma.patient.findUnique({
      where: { id },
      include: {
        user: {
          select: { email: true, createdAt: true },
        },
      },
    });

    if (!patient) {
      throw new NotFoundException('Patient not found');
    }

    return patient;
  }

  // ========================================
  // UPDATE PATIENT (Direct method for internal use)
  // ========================================

  async update(id: string, dto: UpdatePatientDto) {
    const patient = await this.prisma.patient.update({
      where: { id },
      data: {
        ...dto,
        dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : undefined,
      },
    });

    return patient;
  }

  // ========================================
  // GET PATIENT PROFILE
  // ========================================

  async getProfile(userId: string) {
    return this.findByUserId(userId);
  }

  // ========================================
  // UPDATE PATIENT PROFILE (Via User ID)
  // ========================================

  async updateProfile(userId: string, dto: UpdatePatientDto) {
    const patient = await this.findByUserId(userId);

    const updatedPatient = await this.prisma.patient.update({
      where: { id: patient.id },
      data: {
        ...dto,
        dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : undefined,
      },
    });

    return {
      message: 'Profile updated successfully',
      patient: updatedPatient,
    };
  }

  // ========================================
  // UPDATE INSURANCE INFO
  // ========================================

  async updateInsuranceInfo(
    userId: string,
    insuranceData: {
      insuranceProvider?: string;
      insurancePolicy?: string;
      insuranceMemberId?: string;
      insuranceCoverage?: number;
    },
  ) {
    const patient = await this.findByUserId(userId);

    return this.prisma.patient.update({
      where: { id: patient.id },
      data: insuranceData,
    });
  }

  // ========================================
  // GET PATIENT WITH ORDERS
  // ========================================

  async getPatientWithOrders(userId: string) {
    const patient = await this.prisma.patient.findUnique({
      where: { userId },
      include: {
        orders: {
          include: {
            pharmacy: true,
            orderItems: {
              include: {
                medication: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!patient) {
      throw new NotFoundException('Patient not found');
    }

    return patient;
  }

// ========================================
  // GET CLINICAL MEDICAL HISTORY (Vitals & Diagnoses)
  // ========================================
  async getMedicalHistorySummary(patientId: string) {
    // 1. Fetch last 5 appointments that contain triage vitals
    const recentAppointmentsWithVitals = await this.prisma.appointment.findMany({
      where: {
        patientId,
        triageVitals: { isNot: null },
      },
      orderBy: { date: 'desc' },
      take: 5,
      include: {
        triageVitals: true,
        doctor: {
          select: { firstName: true, lastName: true },
        },
        hospital: { select: { name: true } },
      },
    });

    // 2. Fetch last 3 records with formal diagnoses from prescriptions
    const recentPrescriptionsWithDiagnosis = await this.prisma.prescription.findMany({
      where: {
        patientId,
        AND: [
          { diagnosis: { not: null } },
          { diagnosis: { not: '' } },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: 3,
      include: {
        doctor: {
          select: { firstName: true, lastName: true },
        },
      },
    });

    // 3. Format into a clean response structure
    return {
      last5Vitals: recentAppointmentsWithVitals.map((app) => ({
        appointmentId: app.id,
        date: app.date,
        hospitalName: app.hospital.name,
        doctorName: `Dr. ${app.doctor.firstName} ${app.doctor.lastName}`,
        vitals: app.triageVitals,
      })),
      last3Diagnoses: recentPrescriptionsWithDiagnosis.map((pres) => ({
        prescriptionId: pres.id,
        date: pres.createdAt,
        diagnosis: pres.diagnosis,
        notes: pres.notes,
        doctorName: pres.doctor 
          ? `Dr. ${pres.doctor.firstName} ${pres.doctor.lastName}` 
          : 'Unknown Doctor',
      })),
    };
  }

  async getPatientMedicalHistorySelf(userId: string) {
    const patient = await this.findByUserId(userId);
    return this.getMedicalHistorySummary(patient.id);
  }
}