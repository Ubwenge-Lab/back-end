import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateDoctorDto, DoctorFilterDto } from './dto';

const doctorInclude = {
  user: {
    include: {
      hospitalStaff: {
        select: { firstName: true, lastName: true, phone: true, status: true },
      },
    },
  },
  hospital: { select: { id: true, name: true, address: true, phone: true } },
};

@Injectable()
export class DoctorsService {
  constructor(private readonly prisma: PrismaService) {}

  // ========================================
  // LIST ALL DOCTORS (with optional filters)
  // ========================================

  async findAll(filters: DoctorFilterDto) {
    const where: any = {};

    if (filters.specialty) {
      where.specialization = { contains: filters.specialty, mode: 'insensitive' };
    }
    if (filters.available !== undefined) {
      where.isAvailable = filters.available;
    }

    return this.prisma.doctor.findMany({
      where,
      include: doctorInclude,
      orderBy: [{ rating: 'desc' }, { specialization: 'asc' }],
    });
  }

  // ========================================
  // LIST DOCTORS BY HOSPITAL
  // ========================================

  async findByHospital(hospitalId: string, filters: DoctorFilterDto) {
    const hospital = await this.prisma.hospital.findUnique({ where: { id: hospitalId } });
    if (!hospital) throw new NotFoundException('Hospital not found');

    const where: any = { hospitalId };
    if (filters.specialty) {
      where.specialization = { contains: filters.specialty, mode: 'insensitive' };
    }
    if (filters.available !== undefined) {
      where.isAvailable = filters.available;
    }

    return this.prisma.doctor.findMany({
      where,
      include: doctorInclude,
      orderBy: [{ rating: 'desc' }, { specialization: 'asc' }],
    });
  }

  // ========================================
  // GET SINGLE DOCTOR
  // ========================================

  async findOne(id: string) {
    const doctor = await this.prisma.doctor.findUnique({
      where: { id },
      include: doctorInclude,
    });

    if (!doctor) throw new NotFoundException('Doctor not found');
    return doctor;
  }

  // ========================================
  // UPDATE DOCTOR PROFILE (Hospital Admin only)
  // ========================================

  async update(hospitalAdminUserId: string, doctorId: string, dto: UpdateDoctorDto) {
    const hospital = await this.prisma.hospital.findFirst({
      where: { userId: hospitalAdminUserId },
    });

    if (!hospital) throw new ForbiddenException('Only hospital admins can update doctors');

    const doctor = await this.prisma.doctor.findUnique({ where: { id: doctorId } });
    if (!doctor) throw new NotFoundException('Doctor not found');

    if (doctor.hospitalId !== hospital.id) {
      throw new ForbiddenException('You can only update doctors in your hospital');
    }

    if (dto.licenseNumber && dto.licenseNumber !== doctor.licenseNumber) {
      const conflict = await this.prisma.doctor.findUnique({
        where: { licenseNumber: dto.licenseNumber },
      });
      if (conflict) throw new ConflictException('License number already registered');
    }

    return this.prisma.doctor.update({
      where: { id: doctorId },
      data: dto,
      include: doctorInclude,
    });
  }

  // ========================================
  // DELETE DOCTOR (Hospital Admin only)
  // Cascade deletes user -> hospitalStaff -> doctor via Prisma relations
  // ========================================

  async remove(hospitalAdminUserId: string, doctorId: string) {
    const hospital = await this.prisma.hospital.findFirst({
      where: { userId: hospitalAdminUserId },
    });

    if (!hospital) throw new ForbiddenException('Only hospital admins can remove doctors');

    const doctor = await this.prisma.doctor.findUnique({ where: { id: doctorId } });
    if (!doctor) throw new NotFoundException('Doctor not found');

    if (doctor.hospitalId !== hospital.id) {
      throw new ForbiddenException('You can only remove doctors from your hospital');
    }

    await this.prisma.user.delete({ where: { id: doctor.userId } });

    return { message: 'Doctor removed successfully.' };
  }
}
