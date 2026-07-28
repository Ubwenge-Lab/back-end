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
  ConsultationSessionDto,
} from './dto';
import { AppointmentStatus, AppointmentType } from '@prisma/client';
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
      throw new BadRequestException(
        'Appointment must be scheduled in the future',
      );
    }

    const patient = await this.prisma.patient.findUnique({
      where: { userId: patientUserId },
    });
    if (!patient)
      throw new ForbiddenException('Only patients can book appointments');

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
            type:
              dto.type === 'ONLINE'
                ? AppointmentType.ONLINE
                : AppointmentType.IN_PERSON,
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

    try {
      const staffName = appointment.doctor.user.hospitalStaff;
      const doctorName = staffName
        ? `Dr. ${staffName.firstName} ${staffName.lastName}`
        : 'Your doctor';

      const patientUser = await this.prisma.user.findUnique({
        where: { id: patient.userId },
        select: { email: true },
      });
      const patientEmail = patientUser?.email ?? '';

      const doctorUser = await this.prisma.user.findUnique({
        where: { id: appointment.doctor.userId },
        select: { email: true },
      });
      const doctorEmail = doctorUser?.email ?? '';

      // Send Patient Confirmation
      if (patientEmail) {
        await this.notificationsService.sendAppointmentConfirmation({
          email: patientEmail,
          recipientName: `${appointment.patient.firstName} ${appointment.patient.lastName}`,
          doctorName,
          patientName: `${appointment.patient.firstName} ${appointment.patient.lastName}`,
          hospitalName: appointment.hospital.name,
          date,
          reason: dto.reason,
          appointmentId: appointment.id,
          role: 'PATIENT',
          appointmentType: appointment.type,
          hospitalAddress: appointment.hospital.address || undefined,
        });
      }

      // Send Doctor Confirmation
      if (doctorEmail) {
        await this.notificationsService.sendAppointmentConfirmation({
          email: doctorEmail,
          recipientName: doctorName,
          doctorName,
          patientName: `${appointment.patient.firstName} ${appointment.patient.lastName}`,
          hospitalName: appointment.hospital.name,
          date,
          reason: dto.reason,
          appointmentId: appointment.id,
          role: 'DOCTOR',
          appointmentType: appointment.type,
          hospitalAddress: appointment.hospital.address || undefined,
        });
      }

      // Send real-time notification
      await this.notificationsService.create({
        userId: patientUserId,
        type: 'APPOINTMENT_BOOKED',
        title: 'Appointment Confirmed',
        message: `Your appointment with ${doctorName} is confirmed for ${date.toDateString()}.`,
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
  async findAll(userId: string, role: string, from?: string, to?: string) {
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

      // Build optional date filter when from/to are provided
      const dateFilter: any = {};
      if (from) dateFilter.gte = new Date(from);
      if (to) {
        const toDate = new Date(to);
        toDate.setHours(23, 59, 59, 999);
        dateFilter.lte = toDate;
      }

      return this.prisma.appointment.findMany({
        where: {
          doctorId: doctor.id,
          ...(Object.keys(dateFilter).length > 0 ? { date: dateFilter } : {}),
        },
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

    // Receptionists are scoped to today's appointments at their own hospital
    // only — unlike HOSPITAL_ADMIN, who sees the full history, a receptionist
    // is working a front-desk queue and doesn't need appointments from other
    // days or other hospitals.
    if (role === 'RECEPTIONIST') {
      const staff = await this.prisma.hospitalStaff.findFirst({
        where: { userId },
      });
      if (!staff)
        throw new ForbiddenException('Receptionist profile not found');

      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date();
      endOfDay.setHours(23, 59, 59, 999);

      return this.prisma.appointment.findMany({
        where: {
          hospitalId: staff.hospitalId,
          date: { gte: startOfDay, lte: endOfDay },
        },
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
      if (appointment.patientId !== patient?.id)
        throw new ForbiddenException('Access denied');
    }

    if (role === 'DOCTOR') {
      const doctor = await this.prisma.doctor.findUnique({ where: { userId } });
      if (appointment.doctorId !== doctor?.id)
        throw new ForbiddenException('Access denied');
    }

    return appointment;
  }

  // ========================================
  // COMPLETE CONSULT (Invoicing + Diagnosis logs)
  // ========================================
  async completeConsult(
    id: string,
    doctorUserId: string,
    dto: CompleteConsultDto,
  ) {
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
    const hasInsurance =
      coveragePct > 0 && !!appointment.patient.insuranceProvider;
    const insuranceCoveredAmount = hasInsurance
      ? Math.floor((totalAmount * coveragePct) / 100)
      : 0;

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

    try {
      await this.notificationsService.create({
        userId: appointment.patient.userId,
        type: 'CONSULTATION_COMPLETED',
        title: 'Consultation Completed',
        message:
          'Your consultation is complete. Your prescription and invoice are ready.',
      });

      await this.notificationsService.create({
        userId: appointment.patient.userId,
        type: 'INVOICE_GENERATED',
        title: 'Invoice Ready',
        message: `Invoice #${invoice.id} of RWF ${totalAmount} is ready for payment.`,
      });
    } catch (error) {
      console.error('Failed to send COMPLETED/INVOICE notifications:', error);
    }

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
  // UPDATE STATUS
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

    const updatedAppointment = await this.prisma.appointment.update({
      where: { id: appointmentId },
      data: { status: AppointmentStatus.ARRIVED },
      include: { patient: true, doctor: true, hospital: true },
    });

    try {
      await this.notificationsService.create({
        userId: updatedAppointment.doctor.userId,
        type: 'PATIENT_ARRIVED',
        title: 'Patient Arrived',
        message: `Your next patient, ${updatedAppointment.patient.firstName} ${updatedAppointment.patient.lastName}, has arrived and is being triaged.`,
      });
    } catch (error) {
      console.error('Failed to send PATIENT_ARRIVED notification:', error);
    }

    return updatedAppointment;
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

    const updatedAppointment = await this.prisma.$transaction(async (tx) => {
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

    // Send real-time notification to the doctor
    try {
      await this.notificationsService.create({
        userId: updatedAppointment.doctor.userId,
        type: 'READY_FOR_DOCTOR',
        title: 'Patient Ready',
        message: `Patient ${updatedAppointment.patient.firstName} ${updatedAppointment.patient.lastName} is ready for consultation.`,
      });
    } catch (error) {
      console.error('Failed to send READY_FOR_DOCTOR notification:', error);
    }

    return updatedAppointment;
  }

  async getDoctorPatientChart(appointmentId: string, doctorUserId: string) {
    // 1. Extract context of the target appointment session
    const appointment = await this.prisma.appointment.findUnique({
      where: { id: appointmentId },
    });

    if (!appointment) {
      throw new NotFoundException('Appointment session record not found');
    }

    // 2. Verify Doctor profile and multi-tenant hospital alignment
    const doctor = await this.prisma.doctor.findUnique({
      where: { userId: doctorUserId },
    });

    if (!doctor || appointment.hospitalId !== doctor.hospitalId) {
      throw new ForbiddenException(
        'Access Denied: You can only view clinical charts within your assigned hospital',
      );
    }

    // 3. Extract the last 5 triage vitals from structured historical appointments
    const pastAppointmentsWithVitals = await this.prisma.appointment.findMany({
      where: {
        patientId: appointment.patientId,
        triageVitals: { isNot: null },
      },
      orderBy: { date: 'desc' },
      take: 5,
      include: { triageVitals: true },
    });

    // 4. Extract the last 3 clean historical diagnoses text definitions
    const pastPrescriptionsWithDiagnoses =
      await this.prisma.prescription.findMany({
        where: {
          patientId: appointment.patientId,
          AND: [{ diagnosis: { not: null } }, { diagnosis: { not: '' } }],
        },
        orderBy: { createdAt: 'desc' },
        take: 3,
      });

    // 5. Query active, non-fulfilled pending treatment orders
    const activePrescriptions = await this.prisma.prescription.findMany({
      where: {
        patientId: appointment.patientId,
        status: 'PENDING', // Pulls active, non-fulfilled records awaiting medication dispatch
      },
      include: { prescriptionMedications: true },
      orderBy: { createdAt: 'desc' },
    });

    return {
      last5Vitals: pastAppointmentsWithVitals.map((app) => app.triageVitals),
      recentDiagnoses: pastPrescriptionsWithDiagnoses.map((pres) => ({
        date: pres.createdAt,
        diagnosis: pres.diagnosis,
        notes: pres.notes,
      })),
      activePrescriptions,
    };
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

  // ========================================
  // GET TELEMEDICINE ROOM CONFIG
  // ========================================
  async getTelemedicineRoom(id: string, userId?: string, role?: string) {
    const appointment = await this.prisma.appointment.findUnique({
      where: { id },
      include: {
        ...appointmentInclude,
        triageVitals: true,
      },
    });

    if (!appointment) throw new NotFoundException('Appointment not found');

    // Access control: only the patient, the doctor, or hospital/super admin can access (when authenticated)
    if (userId && role) {
      if (role === 'PATIENT') {
        const patient = await this.prisma.patient.findUnique({
          where: { userId },
        });
        if (appointment.patientId !== patient?.id) {
          throw new ForbiddenException('Access denied');
        }
      } else if (role === 'DOCTOR') {
        const doctor = await this.prisma.doctor.findUnique({
          where: { userId },
        });
        if (appointment.doctorId !== doctor?.id) {
          throw new ForbiddenException('Access denied');
        }
      } else if (role !== 'SUPER_ADMIN' && role !== 'HOSPITAL_ADMIN') {
        throw new ForbiddenException('Access denied');
      }
    }

    const staffName = appointment.doctor.user.hospitalStaff;
    const doctorName = staffName
      ? `Dr. ${staffName.firstName} ${staffName.lastName}`
      : 'Doctor';

    return {
      roomName: `EVUZE-Consultation-${appointment.id}`,
      domain: 'meet.jit.si',
      jitsiUrl: `https://meet.jit.si/EVUZE-Consultation-${appointment.id}`,
      appointmentId: appointment.id,
      doctorName,
      patientName: `${appointment.patient.firstName} ${appointment.patient.lastName}`,
      appointmentType: appointment.type,
      triageVitals: appointment.triageVitals,
      reason: appointment.reason,
    };
  }

  // ========================================
  // LOG TELEMEDICINE SESSION & CALCULATE DURATION
  // ========================================
  async logConsultationSession(id: string, dto: ConsultationSessionDto) {
    const appointment = await this.prisma.appointment.findUnique({
      where: { id },
    });
    if (!appointment) throw new NotFoundException('Appointment not found');

    // Save connection log
    await this.prisma.telemedicineSessionLog.create({
      data: {
        appointmentId: id,
        userId: dto.userId,
        role: dto.role,
        action: dto.action,
      },
    });

    // If a doctor leaves, compute the active connection time session length and increment telemedicineDuration
    if (dto.role === 'DOCTOR' && dto.action === 'LEAVE') {
      const lastJoin = await this.prisma.telemedicineSessionLog.findFirst({
        where: {
          appointmentId: id,
          userId: dto.userId,
          role: 'DOCTOR',
          action: 'JOIN',
        },
        orderBy: { timestamp: 'desc' },
      });

      if (lastJoin) {
        const durationSeconds = Math.max(
          0,
          Math.floor(
            (new Date().getTime() - lastJoin.timestamp.getTime()) / 1000,
          ),
        );

        const currentDuration = appointment.telemedicineDuration || 0;

        await this.prisma.appointment.update({
          where: { id },
          data: {
            telemedicineDuration: currentDuration + durationSeconds,
          },
        });
        console.log(
          `⏱️ Doctor active call duration incremented by ${durationSeconds} seconds for appointment ${id}`,
        );
      }
    }

    return { success: true };
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
