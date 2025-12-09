// backend/src/patients/patients.service.ts

import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UpdatePatientDto } from './dto/update-patient.dto';

@Injectable()
export class PatientsService {
  constructor(private prisma: PrismaService) {}

  async findByUserId(userId: string) {
    const patient = await this.prisma.patient.findUnique({
      where: { userId },
    });

    if (!patient) {
      throw new NotFoundException('Patient not found');
    }

    return patient;
  }

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

  async update(id: string, dto: UpdatePatientDto) {
    const patient = await this.prisma.patient.update({
      where: { id },
      data: dto,
    });

    return patient;
  }

  async getProfile(userId: string) {
    return this.findByUserId(userId);
  }

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
}