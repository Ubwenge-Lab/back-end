import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { generateMRN } from '../utils/hospital';

@Injectable()
export class HospitalsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    return this.prisma.hospital.findMany({
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string) {
    const hospital = await this.prisma.hospital.findUnique({ where: { id } });
    if (!hospital) throw new NotFoundException('Hospital not found');
    return hospital;
  }

  // Now properly inside the class
  async searchPatient(identifier: string) {
    const patient = await this.prisma.patient.findFirst({
      where: {
        OR: [{ nationalId: identifier }, { phone: identifier }],
      },
      include: {
        user: {
          select: { email: true, isActive: true },
        },
      },
    });

    if (!patient) {
      throw new NotFoundException(
        `Patient with identifier ${identifier} not found`,
      );
    }
    return patient;
  }

  // Now properly inside the class
  async linkPatientToHospital(hospitalId: string, patientId: string) {
    const patient = await this.prisma.patient.findUnique({
      where: { id: patientId },
    });

    if (!patient) throw new NotFoundException('Patient record not found');

    if (patient.hospitalId === hospitalId) {
      throw new ConflictException(
        'Patient is already registered at this hospital',
      );
    }

    return this.prisma.patient.update({
      where: { id: patientId },
      data: {
        hospitalId: hospitalId,
        mrn: generateMRN(),
      },
    });
  }
}
