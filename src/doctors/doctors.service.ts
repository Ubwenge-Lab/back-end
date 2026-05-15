import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DoctorQueryDto } from './dto/doctor-query.dto';

@Injectable()
export class DoctorsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: DoctorQueryDto) {
    const where: any = { }

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
        hospital: { 
          select: { 
            id: true, 
            name: true, 
            phone: true 
          } 
        },
        user: { 
          select: { 
            email: true,
          } 
        },
      },

       orderBy: { specialization: 'asc' },
    });

    return doctors.map((doctor) => {

      return {
        id: doctor.id,
        specialty: doctor.specialization,
        email: doctor.user.email,
        phone: doctor.hospital.phone,
        hospitalId: doctor.hospitalId,
        hospitalName: doctor.hospital.name,
        hospitalPhone: doctor.hospital.phone,
        licenseNumber: doctor.licenseNumber,
        bio: doctor.bio || '',
      };
    });
  }
}