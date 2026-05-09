import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DoctorQueryDto } from './dto/doctor-query.dto';

@Injectable()
export class DoctorsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: DoctorQueryDto) {
    const where: any = {
      user: { role: 'DOCTOR' },
      status: 'ACTIVE',
    };

    if (query.specialty) {
      where.specialty = {
        contains: query.specialty,
        mode: 'insensitive',
      };
    }

    if (query.hospital_id) {
      where.hospitalId = query.hospital_id;
    }

    const doctors = await this.prisma.hospitalStaff.findMany({
      where,
      include: {
        hospital: { select: { id: true, name: true } },
        user: { select: { email: true } },
      },
      orderBy: { lastName: 'asc' },
    });

    return doctors.map((doctor) => ({
      id: doctor.id,
      firstName: doctor.firstName,
      lastName: doctor.lastName,
      specialty: doctor.specialty,
      email: doctor.user.email,
      phone: doctor.phone,
      hospitalId: doctor.hospitalId,
      hospitalName: doctor.hospital.name,
      status: doctor.status,
      createdAt: doctor.createdAt,
      updatedAt: doctor.updatedAt,
    }));
  }
}
