import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GetDoctorsQueryDto } from './dto/get-doctors-query.dto';

@Injectable()
export class DoctorsService {
  constructor(private prisma: PrismaService) {}

  async findAll(query: GetDoctorsQueryDto) {
    const where: any = {};

    if (query.specialty) {
      where.specialization = {
        contains: query.specialty,
        mode: 'insensitive',
      };
    }

    if (query.hospital_id) {
      where.hospitalId = query.hospital_id;
    }

    const doctors = await this.prisma.doctor.findMany({
      where,
      include: {
        user: {
          select: {
            email: true,
          },
        },
        hospital: {
          select: {
            name: true,
            address: true,
          },
        },
      },
    });

    return doctors.map((doc) => ({
      id: doc.id,
      userId: doc.userId,
      hospitalId: doc.hospitalId,
      specialization: doc.specialization,
      licenseNumber: doc.licenseNumber,
      bio: doc.bio,
      email: doc.user?.email || null,
      hospitalName: doc.hospital?.name || null,
      hospitalAddress: doc.hospital?.address || null,
    }));
  }
}
