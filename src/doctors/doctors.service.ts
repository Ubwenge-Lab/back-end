import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateDoctorDto, DoctorFilterDto } from './dto';
import { RequestLeaveDto } from './dto/request-leave.dto';

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
      where.specialization = {
        contains: filters.specialty,
        mode: 'insensitive',
      };
    }

    if (filters.available !== undefined) {
      where.isAvailable = filters.available;
    }

    return this.prisma.doctor.findMany({ where, include: doctorInclude });
  }

  // ========================================
  // LIST DOCTORS BY HOSPITAL
  // ========================================

  async findByHospital(hospitalId: string, filters: DoctorFilterDto) {
    const hospital = await this.prisma.hospital.findUnique({
      where: { id: hospitalId },
    });
    if (!hospital) throw new NotFoundException('Hospital not found');

    const where: any = { hospitalId };

    if (filters.specialty) {
      where.specialization = {
        contains: filters.specialty,
        mode: 'insensitive',
      };
    }

    if (filters.available !== undefined) {
      where.isAvailable = filters.available;
    }

    return this.prisma.doctor.findMany({ where, include: doctorInclude });
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
  // DOCTOR DASHBOARD STATS (Doctor only)
  // Returns stats scoped to the calling doctor's own appointments.
  // ========================================

  async getDoctorDashboard(doctorUserId: string) {
    const doctor = await this.prisma.doctor.findUnique({
      where: { userId: doctorUserId },
      include: { hospital: { select: { id: true, name: true } } },
    });
    if (!doctor) throw new ForbiddenException('Doctor profile not found');

    const now   = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    // All appointments for this doctor
    const allAppointments = await this.prisma.appointment.findMany({
      where: { doctorId: doctor.id },
      select: {
        id: true,
        date: true,
        status: true,
        patientId: true,
      },
    });

    const todayCount = allAppointments.filter((a) => {
      const d = new Date(a.date);
      return (
        d >= today &&
        d < tomorrow &&
        ['SCHEDULED', 'CONFIRMED', 'PENDING', 'ARRIVED', 'READY_FOR_DOCTOR'].includes(a.status)
      );
    }).length;

    const uniquePatients  = new Set(allAppointments.map((a) => a.patientId)).size;
    const completedCount  = allAppointments.filter((a) => a.status === 'COMPLETED').length;
    const totalCount      = allAppointments.length;

    // Appointment status breakdown for patient categories donut
    const statusCounts: Record<string, number> = {};
    for (const a of allAppointments) {
      statusCounts[a.status] = (statusCounts[a.status] ?? 0) + 1;
    }

    // Weekly visit buckets — last 4 weeks
    const weeklyVisits = Array.from({ length: 4 }, (_, i) => {
      const end   = new Date(now); end.setDate(now.getDate() - i * 7);
      const start = new Date(end); start.setDate(end.getDate() - 6);
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);

      const label = `${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
      const count = allAppointments.filter((a) => {
        const d = new Date(a.date);
        return d >= start && d <= end;
      }).length;

      return { label, count };
    }).reverse();

    return {
      todayAppointments:  todayCount,
      totalPatients:      uniquePatients,
      completedConsults:  completedCount,
      totalAppointments:  totalCount,
      appointmentsByStatus: statusCounts,
      weeklyVisits,
      doctorName:    `${doctor.firstName ?? ''} ${doctor.lastName ?? ''}`.trim() || null,
      specialization: doctor.specialization,
      hospitalName:   doctor.hospital?.name ?? null,
    };
  }

  // ========================================
  // UPDATE DOCTOR PROFILE (Hospital Admin only)
  // ========================================

  async update(
    hospitalAdminUserId: string,
    doctorId: string,
    dto: UpdateDoctorDto,
  ) {
    const hospital = await this.prisma.hospital.findFirst({
      where: { userId: hospitalAdminUserId },
    });

    if (!hospital)
      throw new ForbiddenException('Only hospital admins can update doctors');

    const doctor = await this.prisma.doctor.findUnique({
      where: { id: doctorId },
    });
    if (!doctor) throw new NotFoundException('Doctor not found');

    if (doctor.hospitalId !== hospital.id) {
      throw new ForbiddenException(
        'You can only update doctors in your hospital',
      );
    }

    if (dto.licenseNumber && dto.licenseNumber !== doctor.licenseNumber) {
      const conflict = await this.prisma.doctor.findUnique({
        where: { licenseNumber: dto.licenseNumber },
      });
      if (conflict)
        throw new ConflictException('License number already registered');
    }

    return this.prisma.doctor.update({
      where: { id: doctorId },
      data: dto,
      include: doctorInclude,
    });
  }

  // ========================================
  // REMOVE DOCTOR (Hospital Admin only)
  // ========================================

  async remove(hospitalAdminUserId: string, doctorId: string) {
    const hospital = await this.prisma.hospital.findFirst({
      where: { userId: hospitalAdminUserId },
    });
    if (!hospital)
      throw new ForbiddenException('Only hospital admins can remove doctors');

    const doctor = await this.prisma.doctor.findUnique({
      where: { id: doctorId },
    });
    if (!doctor) throw new NotFoundException('Doctor not found');

    if (doctor.hospitalId !== hospital.id) {
      throw new ForbiddenException(
        'You can only remove doctors from your own hospital',
      );
    }

    await this.prisma.doctor.delete({ where: { id: doctorId } });
    return { message: 'Doctor removed successfully' };
  }

  // ========================================
  // REQUEST LEAVE (Doctor only)
  // ========================================

  async requestLeave(doctorUserId: string, dto: RequestLeaveDto) {
    const doctor = await this.prisma.doctor.findUnique({
      where: { userId: doctorUserId },
    });
    if (!doctor) throw new ForbiddenException('Doctor profile not found');

    const start = new Date(dto.startDate);
    const end   = new Date(dto.endDate);

    if (start >= end)
      throw new BadRequestException('startDate must be before endDate');

    const existingLeave = await this.prisma.doctorLeave.findFirst({
      where: {
        doctorId: doctor.id,
        status:   'PENDING',
        OR: [
          { startDate: { lte: end },   endDate: { gte: start } },
        ],
      },
    });

    if (existingLeave)
      throw new ConflictException(
        'You already have a pending leave request overlapping this period',
      );

    const affectedCount = await this.prisma.appointment.count({
      where: {
        doctorId: doctor.id,
        date:     { gte: start, lte: end },
        status:   { notIn: ['CANCELLED', 'COMPLETED'] },
      },
    });

    const leave = await this.prisma.doctorLeave.create({
      data: {
        doctorId:         doctor.id,
        startDate:        start,
        endDate:          end,
        reason:           dto.reason,
        affectedPatients: affectedCount,
      },
    });

    return { ...leave, affectedPatients: affectedCount };
  }
}
