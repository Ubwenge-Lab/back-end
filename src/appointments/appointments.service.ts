import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { BookAppointmentDto, UpdateAppointmentStatusDto } from './dto';
import { AppointmentStatus } from '@prisma/client';

@Injectable()
export class AppointmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  // ========================================
  // BOOK APPOINTMENT
  // Pessimistic locking via SELECT FOR UPDATE prevents double-booking.
  // Two concurrent requests for the same doctor + slot: the second one
  // waits for the first transaction to commit, then sees the conflict.
  // ========================================

  async book(patientUserId: string, dto: BookAppointmentDto) {
    const date = new Date(dto.date);

    if (date <= new Date()) {
      throw new BadRequestException(
        'Appointment must be scheduled in the future',
      );
    }

    // Resolve patient record from the logged-in user
    const patient = await this.prisma.patient.findUnique({
      where: { userId: patientUserId },
    });
    if (!patient)
      throw new ForbiddenException('Only patients can book appointments');

    // Verify the doctor exists and is available
    const doctor = await this.prisma.doctor.findUnique({
      where: { id: dto.doctorId },
      include: {
        hospital: { select: { id: true, name: true } },
        user: {
          include: {
            hospitalStaff: { select: { firstName: true, lastName: true } },
          },
        },
      },
    });
    if (!doctor) throw new NotFoundException('Doctor not found');

    // Transaction with pessimistic locking to prevent double-booking
    const appointment = await this.prisma.$transaction(
      async (tx) => {
        // Lock any existing non-cancelled appointments for this doctor at this exact slot.
        // FOR UPDATE causes concurrent transactions to wait here until the lock is released.
        const conflicts = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM appointments
        WHERE "doctorId" = ${dto.doctorId}
        AND "date" = ${date}
        AND status != 'CANCELLED'
        FOR UPDATE
      `;

        if (conflicts.length > 0) {
          throw new ConflictException(
            'This time slot is already booked. Please choose a different time.',
          );
        }

        return tx.appointment.create({
          data: {
            patientId: patient.id,
            doctorId: dto.doctorId,
            hospitalId: doctor.hospitalId,
            date,
            reason: dto.reason,
            status: AppointmentStatus.SCHEDULED,
          },
          include: {
            doctor: {
              include: {
                user: {
                  include: {
                    hospitalStaff: {
                      select: { firstName: true, lastName: true },
                    },
                  },
                },
              },
            },
            hospital: { select: { name: true, address: true } },
            patient: { select: { firstName: true, lastName: true } },
          },
        });
      },
      { timeout: 30000 },
    );

    // Fire confirmation email — non-blocking, never fails the booking
    try {
      const staffName = appointment.doctor.user.hospitalStaff;
      const doctorName = staffName
        ? `Dr. ${staffName.firstName} ${staffName.lastName}`
        : 'Your doctor';

      await this.notificationsService.sendAppointmentConfirmation({
        patientEmail: patient.userId
          ? ((
              await this.prisma.user.findUnique({
                where: { id: patient.userId },
                select: { email: true },
              })
            )?.email ?? '')
          : '',
        patientName: `${appointment.patient.firstName} ${appointment.patient.lastName}`,
        doctorName,
        hospitalName: appointment.hospital.name,
        date,
        reason: dto.reason,
      });
    } catch (error) {
      console.error('❌ Failed to send appointment confirmation:', error);
    }

    return {
      message: 'Appointment booked successfully.',
      appointment,
    };
  }

  // ========================================
  // LIST APPOINTMENTS (role-scoped)
  // ========================================

  async findAll(userId: string, role: string) {
    if (role === 'PATIENT') {
      const patient = await this.prisma.patient.findUnique({
        where: { userId },
      });
      if (!patient) throw new ForbiddenException('Patient profile not found');

      return this.prisma.appointment.findMany({
        where: { patientId: patient.id },
        include: appointmentInclude,
        orderBy: { date: 'asc' },
      });
    }

    if (role === 'DOCTOR') {
      const doctor = await this.prisma.doctor.findUnique({ where: { userId } });
      if (!doctor) throw new ForbiddenException('Doctor profile not found');

      return this.prisma.appointment.findMany({
        where: { doctorId: doctor.id },
        include: appointmentInclude,
        orderBy: { date: 'asc' },
      });
    }

    if (role === 'HOSPITAL_ADMIN') {
      const hospital = await this.prisma.hospital.findFirst({
        where: { userId },
      });
      if (!hospital) throw new ForbiddenException('Hospital not found');

      return this.prisma.appointment.findMany({
        where: { hospitalId: hospital.id },
        include: appointmentInclude,
        orderBy: { date: 'asc' },
      });
    }

    if (role === 'SUPER_ADMIN') {
      return this.prisma.appointment.findMany({
        include: appointmentInclude,
        orderBy: { date: 'asc' },
      });
    }

    throw new ForbiddenException('Access denied');
  }

  // ========================================
  // GET SINGLE APPOINTMENT
  // ========================================

  async findOne(id: string, userId: string, role: string) {
    const appointment = await this.prisma.appointment.findUnique({
      where: { id },
      include: appointmentInclude,
    });

    if (!appointment) throw new NotFoundException('Appointment not found');

    if (role === 'SUPER_ADMIN' || role === 'HOSPITAL_ADMIN') return appointment;

    if (role === 'PATIENT') {
      const patient = await this.prisma.patient.findUnique({
        where: { userId },
      });
      if (appointment.patientId !== patient?.id) {
        throw new ForbiddenException('Access denied');
      }
    }

    if (role === 'DOCTOR') {
      const doctor = await this.prisma.doctor.findUnique({ where: { userId } });
      if (appointment.doctorId !== doctor?.id) {
        throw new ForbiddenException('Access denied');
      }
    }

    return appointment;
  }

  // ========================================
  // CANCEL APPOINTMENT (patient cancels their own)
  // ========================================

  async cancel(id: string, patientUserId: string) {
    const patient = await this.prisma.patient.findUnique({
      where: { userId: patientUserId },
    });
    if (!patient) throw new ForbiddenException('Patient profile not found');

    const appointment = await this.prisma.appointment.findUnique({
      where: { id },
    });
    if (!appointment) throw new NotFoundException('Appointment not found');

    if (appointment.patientId !== patient.id) {
      throw new ForbiddenException('You can only cancel your own appointments');
    }

    if (appointment.status === AppointmentStatus.CANCELLED) {
      throw new BadRequestException('Appointment is already cancelled');
    }

    if (appointment.status === AppointmentStatus.COMPLETED) {
      throw new BadRequestException('Cannot cancel a completed appointment');
    }

    return this.prisma.appointment.update({
      where: { id },
      data: { status: AppointmentStatus.CANCELLED },
      include: appointmentInclude,
    });
  }

  // ========================================
  // UPDATE STATUS (doctor / hospital admin)
  // ========================================

  async updateStatus(
    id: string,
    userId: string,
    role: string,
    dto: UpdateAppointmentStatusDto,
  ) {
    const appointment = await this.prisma.appointment.findUnique({
      where: { id },
    });
    if (!appointment) throw new NotFoundException('Appointment not found');

    if (role === 'DOCTOR') {
      const doctor = await this.prisma.doctor.findUnique({ where: { userId } });
      if (appointment.doctorId !== doctor?.id) {
        throw new ForbiddenException(
          'You can only update your own appointments',
        );
      }
    }

    if (role === 'HOSPITAL_ADMIN') {
      const hospital = await this.prisma.hospital.findFirst({
        where: { userId },
      });
      if (appointment.hospitalId !== hospital?.id) {
        throw new ForbiddenException(
          'You can only update appointments in your hospital',
        );
      }
    }

    return this.prisma.appointment.update({
      where: { id },
      data: { status: dto.status },
      include: appointmentInclude,
    });
  }
}

const appointmentInclude = {
  patient: { select: { firstName: true, lastName: true, phone: true } },
  doctor: {
    include: {
      user: {
        include: {
          hospitalStaff: { select: { firstName: true, lastName: true } },
        },
      },
    },
  },
  hospital: { select: { id: true, name: true, address: true } },
};
