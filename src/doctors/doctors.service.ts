import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DoctorQueryDto } from './dto/doctor-query.dto';

@Injectable()
export class DoctorsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: DoctorQueryDto) {
    const where: any = {
      user: { role: 'DOCTOR' },
    };

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
            hospitalStaff: {
              select: {
                firstName: true,
                lastName: true,
                phone: true,
                status: true,
                createdAt: true,
                updatedAt: true
              }
            }
          } 
        },
      },
      orderBy: { user: { hospitalStaff: { lastName: 'asc' } } },
    });

    return doctors.map((doctor) => {
      const hospitalStaff = doctor.user.hospitalStaff;

      return {
        id: doctor.id,
        firstName: hospitalStaff?.firstName || 'Doctor',
        lastName: hospitalStaff?.lastName || doctor.specialization,
        specialty: doctor.specialization,
        email: doctor.user.email,
        phone: hospitalStaff?.phone || doctor.hospital.phone,
        hospitalId: doctor.hospitalId,
        hospitalName: doctor.hospital.name,
        hospitalPhone: doctor.hospital.phone,
        status: hospitalStaff?.status || 'ACTIVE',
        createdAt: hospitalStaff?.createdAt || new Date(),
        updatedAt: hospitalStaff?.updatedAt || new Date(),
        licenseNumber: doctor.licenseNumber,
        bio: doctor.bio || '',
      };
    });
  }
}