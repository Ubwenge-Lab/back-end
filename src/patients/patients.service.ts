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
}