// backend/src/patients/patients.service.ts

import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
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

// ========================================================
  // NEW MASTER MEDICAL HISTORY VIA MRN (Task Requirements)
  // ========================================================
  async getMasterMedicalHistory(mrn: string, userPayload: any, page: string, limit: string) {
    // 1. Resolve patient using either global MRN or a hospital-registered scoped MRN
    const patient = await this.prisma.patient.findFirst({
      where: {
        OR: [
          { mrn: mrn },
          { hospitalRegistrations: { some: { mrn: mrn } } },
        ],
      },
    });

    if (!patient) {
      throw new NotFoundException(`Patient with MRN ${mrn} not found`);
    }

    // 2. Multi-Tenant Role-Based Privacy Guard
    if (userPayload.role === 'PATIENT') {
      if (patient.userId !== userPayload.sub) {
        throw new ForbiddenException('You can only access your own medical records');
      }
    } else if (userPayload.role === 'DOCTOR') {
      const doctor = await this.prisma.doctor.findUnique({
        where: { userId: userPayload.sub },
      });
      if (!doctor) {
        throw new ForbiddenException('Doctor clinical profile not found');
      }
      
      // Enforce boundary: Doctor can only see patients registered in their specific hospital
      const isRegisteredAtHospital = await this.prisma.hospitalPatientRegistration.findFirst({
        where: {
          patientId: patient.id,
          hospitalId: doctor.hospitalId,
        },
      });
      if (!isRegisteredAtHospital) {
        throw new ForbiddenException('Access Denied: Patient is not registered at your hospital');
      }
    }

    // 3. Process Safe Pagination Arithmetic
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(1, parseInt(limit, 10) || 10);
    const skip = (pageNum - 1) * limitNum;

    // 4. Parallel Query Aggregation
    const [
      appointments,
      prescriptions,
      invoices,
      totalAppointments,
      totalPrescriptions,
      totalInvoices,
    ] = await Promise.all([
      this.prisma.appointment.findMany({
        where: { patientId: patient.id },
        include: { triageVitals: true },
        orderBy: { date: 'desc' },
        skip,
        take: limitNum,
      }),
      this.prisma.prescription.findMany({
        where: { patientId: patient.id },
        include: { prescriptionMedications: true },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limitNum,
      }),
      this.prisma.hospitalInvoice.findMany({
        where: { patientId: patient.id },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limitNum,
      }),
      this.prisma.appointment.count({ where: { patientId: patient.id } }),
      this.prisma.prescription.count({ where: { patientId: patient.id } }),
      this.prisma.hospitalInvoice.count({ where: { patientId: patient.id } }),
    ]);

    return {
      demographics: {
        firstName: patient.firstName,
        lastName: patient.lastName,
        dateOfBirth: patient.dateOfBirth,
        gender: patient.gender,
        bloodGroup: (patient as any).bloodGroup || null, // Guard against future schema additions
        insuranceProvider: patient.insuranceProvider,
      },
      appointments,
      prescriptions,
      invoices,
      meta: {
        currentPage: pageNum,
        limit: limitNum,
        totalAppointments,
        totalPrescriptions,
        totalInvoices,
      },
    };
  }
}