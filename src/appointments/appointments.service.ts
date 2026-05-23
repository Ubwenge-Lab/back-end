import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  BookAppointmentDto,
  UpdateAppointmentStatusDto,
  CompleteConsultDto,
} from './dto';
import { AppointmentStatus } from '@prisma/client';
import { TriageVitalsDto } from './dto/triage-vitals.dto';

@Injectable()
export class AppointmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  // ========================================
  // BOOK APPOINTMENT
  // ========================================
  async book(patientUserId: string, dto: BookAppointmentDto) {
    const date = new Date(dto.date);

    if (date <= new Date()) {
      throw new BadRequestException('Appointment must be scheduled in the future');
    }

    const patient = await this.prisma.patient.findUnique({
      where: { userId: patientUserId },
    });
    if (!patient) throw new ForbiddenException('Only patients can book appointments');

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

    const appointment = await this.prisma.$transaction(
      async (tx) => {
        const conflicts = await tx.$queryRaw<{ id: string }[]>`
          SELECT id FROM appointments
          WHERE "doctorId" = ${dto.doctorId}
          AND "date" = ${date}
          AND status != 'CANCELLED'
          FOR UPDATE
        `;

        if (conflicts.length > 0) {
          throw new ConflictException('This time slot is already booked. Please choose a different time.');
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
                    hospitalStaff: { select: { firstName: true, lastName: true } },
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

    try {
      const staffName = appointment.doctor.user.hospitalStaff;
      const doctorName = staffName ? `Dr. ${staffName.firstName} ${staffName.lastName}` : 'Your doctor';

      await this.notificationsService.sendAppointmentConfirmation({
        patientEmail: patient.userId
          ? ((await this.prisma.user.findUnique({
              where: { id: patient.userId },
              select: { email: true },
            }))?.email ?? '')
          : '',
        patientName: `${appointment.patient.firstName} ${appointment.patient.lastName}`,
        doctorName,
        hospitalName: appointment.hospital.name,
        date,
        reason: dto.reason,
      });
    } catch (error) {
      console.error('Failed to send appointment confirmation:', error);
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
      const patient = await this.prisma.patient.findUnique({ where: { userId } });
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
      const hospital = await this.prisma.hospital.findFirst({ where: { userId } });
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
      const patient = await this.prisma.patient.findUnique({ where: { userId } });
      if (appointment.patientId !== patient?.id) throw new ForbiddenException('Access denied');
    }

    if (role === 'DOCTOR') {
      const doctor = await this.prisma.doctor.findUnique({ where: { userId } });
      if (appointment.doctorId !== doctor?.id) throw new ForbiddenException('Access denied');
    }

    return appointment;
  }

  // ========================================
  // COMPLETE CONSULT (Invoicing + Diagnosis logs)
  // ========================================
  async completeConsult(id: string, doctorUserId: string, dto: CompleteConsultDto) {
    const appointment = await this.prisma.appointment.findUnique({
      where: { id },
      include: {
        patient: true,
        hospital: { select: { id: true, name: true } },
      },
    });
    if (!appointment) throw new NotFoundException('Appointment not found');

    const doctor = await this.prisma.doctor.findUnique({
      where: { userId: doctorUserId },
    });
    if (!doctor || appointment.doctorId !== doctor.id) {
      throw new ForbiddenException(
        'You can only complete your own appointments',
      );
    }

    if (appointment.status === AppointmentStatus.COMPLETED) {
      throw new BadRequestException('Appointment is already completed');
    }
    if (appointment.status === AppointmentStatus.CANCELLED) {
      throw new BadRequestException('Cannot complete a cancelled appointment');
    }

    const config = await this.prisma.hospitalConfig.findUnique({
      where: { hospitalId: appointment.hospitalId },
    });

    type LineItem = {
      description: string;
      quantity: number;
      unitCost: number;
      subtotal: number;
    };
    const lineItems: LineItem[] = [];

    if (config) {
      lineItems.push({
        description: 'Consultation fee',
        quantity: 1,
        unitCost: Number(config.consultationFee),
        subtotal: Number(config.consultationFee),
      });
      lineItems.push({
        description: 'Triage fee',
        quantity: 1,
        unitCost: Number(config.triageFee),
        subtotal: Number(config.triageFee),
      });
    }

    if (dto.items?.length) {
      dto.items.forEach((item) => {
        lineItems.push({
          description: item.description,
          quantity: item.quantity,
          unitCost: item.unitCost,
          subtotal: item.quantity * item.unitCost,
        });
      });
    }

    if (!lineItems.length) {
      throw new BadRequestException('No line items to invoice.');
    }

    const totalAmount = lineItems.reduce((sum, item) => sum + item.subtotal, 0);
    const coveragePct = appointment.patient.insuranceCoverage ?? 0;
    const hasInsurance = coveragePct > 0 && !!appointment.patient.insuranceProvider;
    const insuranceCoveredAmount = hasInsurance ? Math.floor((totalAmount * coveragePct) / 100) : 0;

    const invoice = await this.prisma.$transaction(
      async (tx) => {
        await tx.appointment.update({
          where: { id },
          data: {
            status: AppointmentStatus.COMPLETED,
            diagnosisSummary: dto.diagnosisSummary,
            doctorRecommendations: dto.doctorRecommendations,
            ...(dto.notes && { notes: dto.notes }),
          },
        });

        return tx.hospitalInvoice.create({
          data: {
            appointmentId: id,
            hospitalId: appointment.hospitalId,
            patientId: appointment.patientId,
            totalAmount,
            insuranceCovered: hasInsurance,
            paymentStatus: hasInsurance ? 'INSURANCE_PENDING' : 'UNPAID',
            items: { create: lineItems },
          },
          include: { items: true },
        });
      },
      { timeout: 30000 },
    );

    return {
      message: 'Consultation completed and invoice generated.',
      invoice,
      billing: {
        totalAmount,
        insuranceCoverage: {
          percentage: coveragePct,
          amount: insuranceCoveredAmount,
        },
        patientOwes: totalAmount - insuranceCoveredAmount,
      },
    };
  }

  // ========================================
  // CANCEL APPOINTMENT
  // ========================================
  async cancel(id: string, patientUserId: string) {
    const patient = await this.prisma.patient.findUnique({ where: { userId: patientUserId } });
    if (!patient) throw new ForbiddenException('Patient profile not found');

    const appointment = await this.prisma.appointment.findUnique({ where: { id } });
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
  // UPDATE STATUS
  // ========================================
  async updateStatus(id: string, userId: string, role: string, dto: UpdateAppointmentStatusDto) {
    const appointment = await this.prisma.appointment.findUnique({ where: { id } });
    if (!appointment) throw new NotFoundException('Appointment not found');

    if (role === 'DOCTOR') {
      const doctor = await this.prisma.doctor.findUnique({ where: { userId } });
      if (appointment.doctorId !== doctor?.id) {
        throw new ForbiddenException('You can only update your own appointments');
      }
    }

    if (role === 'HOSPITAL_ADMIN') {
      const hospital = await this.prisma.hospital.findFirst({ where: { userId } });
      if (appointment.hospitalId !== hospital?.id) {
        throw new ForbiddenException('You can only update appointments in your hospital');
      }
    }

    return this.prisma.appointment.update({
      where: { id },
      data: { status: dto.status },
      include: appointmentInclude,
    });
  }

  // ========================================
  // CHECK IN — receptionist marks patient as arrived
  // ========================================

  async checkIn(appointmentId: string, userId: string) {
    const appointment = await this.prisma.appointment.findUnique({
      where: { id: appointmentId },
    });

    if (!appointment) {
      throw new NotFoundException('Appointment not found');
    }

    await this.assertHospitalStaff(userId, appointment.hospitalId);

    if (appointment.status !== AppointmentStatus.SCHEDULED) {
      throw new ConflictException(
        `Cannot check in appointment with status "${appointment.status}". ` +
          `Appointment must be SCHEDULED.`,
      );
    }

    return this.prisma.appointment.update({
      where: { id: appointmentId },
      data: { status: AppointmentStatus.ARRIVED },
      include: { patient: true, doctor: true, hospital: true },
    });
  }

  // ========================================
  // RECORD TRIAGE — nurse captures vitals
  // ========================================

  async recordTriage(
    appointmentId: string,
    userId: string,
    dto: TriageVitalsDto,
  ) {
    const appointment = await this.prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: { triageVitals: true },
    });

    if (!appointment) {
      throw new NotFoundException('Appointment not found');
    }

    await this.assertHospitalStaff(userId, appointment.hospitalId);

    if (appointment.status !== AppointmentStatus.ARRIVED) {
      throw new ConflictException(
        `Cannot triage appointment with status "${appointment.status}". ` +
          `Patient must be checked in (ARRIVED) first.`,
      );
    }

    if (appointment.triageVitals) {
      throw new ConflictException(
        'Triage vitals already recorded for this appointment.',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.appointment.update({
        where: { id: appointmentId },
        data: { status: AppointmentStatus.IN_TRIAGE },
      });

      await tx.triageVitals.create({
        data: {
          appointmentId,
          bloodPressure: dto.bloodPressure,
          temperature: dto.temperature,
          weight: dto.weight,
          heartRate: dto.heartRate,
          oxygenSaturation: dto.oxygenSaturation,
          nurseNotes: dto.notes,
        },
      });

      return tx.appointment.update({
        where: { id: appointmentId },
        data: { status: AppointmentStatus.READY_FOR_DOCTOR },
        include: {
          patient: true,
          doctor: true,
          hospital: true,
          triageVitals: true,
        },
      });
    });
  }

  // ========================================
  // ASSERT HOSPITAL STAFF — shared guard
  // ========================================

  private async assertHospitalStaff(userId: string, hospitalId: string) {
    const staff = await this.prisma.hospitalStaff.findFirst({
      where: { userId, hospitalId },
    });

    if (!staff) {
      throw new ForbiddenException(
        'You are not authorised to act on appointments at this hospital.',
      );
    }
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
