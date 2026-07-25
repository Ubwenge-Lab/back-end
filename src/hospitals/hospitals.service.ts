import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { generateMRN } from '../utils/hospital';
import { FlutterwaveService } from '../payments/flutterwave.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  UpdateLeaveStatusDto,
  LeaveAction,
} from '../doctors/dto/update-leave-status.dto';

@Injectable()
export class HospitalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly flutterwaveService: FlutterwaveService,
    private readonly notificationsService: NotificationsService,
  ) { }

  async findAll() {
    return this.prisma.hospital.findMany({
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string) {
    const hospital = await this.prisma.hospital.findUnique({
      where: { id },
      include: { user: { select: { email: true } } },
    });
    if (!hospital) throw new NotFoundException('Hospital not found');
    // HospitalDto documents an `email` field, but Hospital has no email
    // column — it lives on the linked User row. Previously this method
    // returned the raw Prisma record with no `email` key at all, silently
    // breaking the documented contract.
    const { user, ...rest } = hospital;
    return { ...rest, email: user?.email ?? null };
  }

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

  // Updated to use Nissi's Join Table (HospitalPatientRegistration)
  async linkPatientToHospital(hospitalId: string, patientId: string) {
    const patient = await this.prisma.patient.findUnique({
      where: { id: patientId },
    });

    if (!patient) throw new NotFoundException('Patient record not found');

    // Check if registration already exists in the join table
    const existingRegistration =
      await this.prisma.hospitalPatientRegistration.findUnique({
        where: {
          patientId_hospitalId: {
            patientId,
            hospitalId,
          },
        },
      });

    if (existingRegistration) {
      throw new ConflictException(
        'Patient is already registered at this hospital',
      );
    }

    // Create the registration in the join table
    return this.prisma.hospitalPatientRegistration.create({
      data: {
        hospitalId,
        patientId,
        mrn: generateMRN(),
      },
    });
  }

  async getHospitalPatients(hospitalId: string, doctorId?: string) {
    let doctorPatientIds: string[] | undefined;

    if (doctorId) {
      const appointments = await this.prisma.appointment.findMany({
        where: { hospitalId, doctorId },
        select: { patientId: true },
        distinct: ['patientId'],
      });
      doctorPatientIds = appointments.map((appt) => appt.patientId);

      if (doctorPatientIds.length === 0) {
        return [];
      }
    }

    const registrations = await this.prisma.hospitalPatientRegistration.findMany({
      where: {
        hospitalId,
        ...(doctorPatientIds ? { patientId: { in: doctorPatientIds } } : {}),
      },
      include: {
        patient: {
          include: {
            user: {
              select: { email: true, isActive: true },
            },
          },
        },
      },
      orderBy: { registeredAt: 'desc' },
    });

    return registrations.map((reg) => ({
      ...reg.patient,
      hospitalMrn: reg.mrn,
      registeredAt: reg.registeredAt,
    }));
  }

  async findDoctors(
    hospitalId: string,
    specialty?: string,
    available?: boolean,
  ) {
    const hospital = await this.prisma.hospital.findUnique({
      where: { id: hospitalId },
    });
    if (!hospital) throw new NotFoundException('Hospital not found');

    const where: any = { hospitalId };
    if (specialty)
      where.specialization = { contains: specialty, mode: 'insensitive' };
    if (available !== undefined) where.isAvailable = available;

    return this.prisma.doctor.findMany({
      where,
      include: {
        // SECURITY FIX: this previously used `include` with no `select` on
        // `user`, which returns every column on User — password hash,
        // refreshToken, verificationCode — to any caller of this endpoint,
        // including Role.PATIENT. Scoped to just `email` now, the only User
        // field anything downstream actually reads.
        user: {
          select: {
            email: true,
            hospitalStaff: {
              select: { firstName: true, lastName: true, phone: true },
            },
          },
        },
      },
      orderBy: [{ rating: 'desc' }, { specialization: 'asc' }],
    });
  }

  // Aggregates doctors by specialization into a "department" view. There is
  // no Department model on the backend — this mirrors the client-side
  // derivation the frontend was doing in departments/page.tsx, just moved
  // server-side so there's a real endpoint instead of none at all.
  //
  // nurseCount/head are sourced from HospitalStaff.department and
  // Doctor.isDepartmentHead — both added in this migration (see
  // src/docs/HOSPITAL_ADMIN_DASHBOARD_DEPARTMENTS_INTEGRATION.md, Gap 2/3).
  // NOTE: this requires that migration to actually be applied to the
  // database before it works at runtime — `prisma generate` only updates
  // the TypeScript client, it doesn't touch the DB schema.
  async getDepartments(hospitalId: string) {
    const hospital = await this.prisma.hospital.findUnique({
      where: { id: hospitalId },
    });
    if (!hospital) throw new NotFoundException('Hospital not found');

    const doctors = await this.prisma.doctor.findMany({
      where: { hospitalId },
      select: { specialization: true, isAvailable: true, isDepartmentHead: true, firstName: true, lastName: true },
    });

    const nurses = await this.prisma.hospitalStaff.findMany({
      where: { hospitalId, department: { not: null } },
      select: { department: true },
    });

    const departments = new Map<string, {
      doctorCount: number;
      nurseCount: number;
      hasAvailableDoctor: boolean;
      head: string | null;
    }>();

    for (const doctor of doctors) {
      const entry = departments.get(doctor.specialization) ?? {
        doctorCount: 0,
        nurseCount: 0,
        hasAvailableDoctor: false,
        head: null,
      };
      entry.doctorCount += 1;
      if (doctor.isAvailable) entry.hasAvailableDoctor = true;
      if (doctor.isDepartmentHead) {
        entry.head = `${doctor.firstName ?? ''} ${doctor.lastName ?? ''}`.trim() || null;
      }
      departments.set(doctor.specialization, entry);
    }

    for (const nurse of nurses) {
      const department = nurse.department as string;
      const entry = departments.get(department) ?? {
        doctorCount: 0,
        nurseCount: 0,
        hasAvailableDoctor: false,
        head: null,
      };
      entry.nurseCount += 1;
      departments.set(department, entry);
    }

    return Array.from(departments.entries())
      .map(([name, entry]) => ({
        id: name.toLowerCase().replace(/\s+/g, '-'),
        name,
        doctorCount: entry.doctorCount,
        nurseCount: entry.nurseCount,
        status: entry.hasAvailableDoctor ? ('ACTIVE' as const) : ('INACTIVE' as const),
        head: entry.head,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async getStats(hospitalId: string, userId: string) {
    await this.validateHospitalReadAccess(hospitalId, userId);

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(
      now.getFullYear(),
      now.getMonth() + 1,
      0,
      23,
      59,
      59,
      999,
    );

    // 1. Doctor counts
    const doctorStatsResult = await this.prisma.$queryRaw<any[]>`
      SELECT 
        COUNT(*)::int AS total,
        COUNT(CASE WHEN "isAvailable" = true THEN 1 END)::int AS active
      FROM doctors
      WHERE "hospitalId" = ${hospitalId}
    `;
    const totalDoctors = Number(doctorStatsResult[0]?.total ?? 0);
    const activeDoctors = Number(doctorStatsResult[0]?.active ?? 0);

    // 2. Patient counts
    const patientStatsResult = await this.prisma.$queryRaw<any[]>`
      SELECT COUNT(*)::int AS total
      FROM hospital_patient_registrations
      WHERE "hospitalId" = ${hospitalId}
    `;
    const totalPatients = Number(patientStatsResult[0]?.total ?? 0);

    // 3. Appointment counts (this month vs all-time)
    const appointmentStatsResult = await this.prisma.$queryRaw<any[]>`
      SELECT 
        COUNT(*)::int AS all_time,
        COUNT(CASE WHEN "date" >= ${startOfMonth} AND "date" <= ${endOfMonth} THEN 1 END)::int AS this_month
      FROM appointments
      WHERE "hospitalId" = ${hospitalId}
    `;
    const totalAppointments = {
      thisMonth: Number(appointmentStatsResult[0]?.this_month ?? 0),
      allTime: Number(appointmentStatsResult[0]?.all_time ?? 0),
    };

    // 4. Appointment status breakdown
    const statusRows = await this.prisma.$queryRaw<any[]>`
      SELECT status, COUNT(*)::int AS count
      FROM appointments
      WHERE "hospitalId" = ${hospitalId}
      GROUP BY status
    `;

    const appointmentsByStatus = {
      PENDING: 0,
      CONFIRMED: 0,
      COMPLETED: 0,
      CANCELLED: 0,
    };

    // AppointmentStatus on the backend (SCHEDULED, COMPLETED, CANCELLED,
    // NO_SHOW, ARRIVED, IN_TRIAGE, READY_FOR_DOCTOR) has no CONFIRMED value —
    // there is no 1:1 mapping to the frontend's 4-bucket summary. ARRIVED/
    // IN_TRIAGE/READY_FOR_DOCTOR all represent an appointment the patient
    // has actually shown up for and is actively progressing through, which
    // is the closest match to "confirmed" as opposed to merely SCHEDULED.
    // NO_SHOW is bucketed with CANCELLED since neither resulted in a
    // completed visit. Every status row now lands in a bucket instead of
    // 4 of 7 being silently dropped.
    for (const row of statusRows) {
      const status = row.status;
      const count = Number(row.count);
      if (status === 'SCHEDULED') {
        appointmentsByStatus.PENDING += count;
      } else if (status === 'ARRIVED' || status === 'IN_TRIAGE' || status === 'READY_FOR_DOCTOR') {
        appointmentsByStatus.CONFIRMED += count;
      } else if (status === 'COMPLETED') {
        appointmentsByStatus.COMPLETED += count;
      } else if (status === 'CANCELLED' || status === 'NO_SHOW') {
        appointmentsByStatus.CANCELLED += count;
      }
    }

    // 5. Revenue counts (total vs monthly)
    const revenueStatsResult = await this.prisma.$queryRaw<any[]>`
      SELECT 
        COALESCE(SUM("totalAmount"), 0)::float AS total_revenue,
        COALESCE(SUM(CASE WHEN "issuedAt" >= ${startOfMonth} AND "issuedAt" <= ${endOfMonth} THEN "totalAmount" ELSE 0 END), 0)::float AS monthly_revenue
      FROM hospital_invoices
      WHERE "hospitalId" = ${hospitalId}
    `;
    const totalRevenue = Number(revenueStatsResult[0]?.total_revenue ?? 0);
    const monthlyRevenue = Number(revenueStatsResult[0]?.monthly_revenue ?? 0);

    return {
      totalAppointments,
      appointmentsByStatus,
      totalRevenue,
      monthlyRevenue,
      totalDoctors,
      activeDoctors,
      totalPatients,
    };
  }

  async getDailyAppointments(hospitalId: string, userId: string) {
    await this.validateHospitalAccess(hospitalId, userId);

    const now = new Date();
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(now.getDate() - 29);
    thirtyDaysAgo.setHours(0, 0, 0, 0);

    const days: { date: string; label: string }[] = [];
    for (let i = 0; i < 30; i++) {
      const d = new Date(thirtyDaysAgo);
      d.setDate(thirtyDaysAgo.getDate() + i);
      days.push({
        date: d.toISOString().split('T')[0],
        label: d.toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
        }),
      });
    }

    type DailyRow = { day: Date; count: number };
    const rows = await this.prisma.$queryRaw<DailyRow[]>`
      SELECT DATE_TRUNC('day', "date") AS day,
             COUNT(*)::int             AS count
      FROM   appointments
      WHERE  "hospitalId" = ${hospitalId}
        AND  "date" >= ${thirtyDaysAgo}
      GROUP  BY DATE_TRUNC('day', "date")
      ORDER  BY day ASC
    `;

    const lookup = new Map<string, number>();
    for (const r of rows) {
      const dateStr = new Date(r.day).toISOString().split('T')[0];
      lookup.set(dateStr, Number(r.count));
    }

    return days.map(({ date, label }) => ({
      date,
      label,
      count: lookup.get(date) ?? 0,
    }));
  }

  async getWeeklyRevenue(hospitalId: string, userId: string) {
    await this.validateHospitalReadAccess(hospitalId, userId);

    const now = new Date();
    const dayOfWeek = now.getDay();
    const daysSinceMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;

    const currentMonday = new Date(now);
    currentMonday.setDate(now.getDate() - daysSinceMonday);
    currentMonday.setHours(0, 0, 0, 0);

    const weeks: { label: string; start: Date; end: Date }[] = [];
    for (let w = 3; w >= 0; w--) {
      const start = new Date(currentMonday);
      start.setDate(currentMonday.getDate() - w * 7);
      const end = new Date(start);
      end.setDate(start.getDate() + 6);
      end.setHours(23, 59, 59, 999);

      const label = `${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
      weeks.push({ label, start, end });
    }

    const oldestStart = weeks[0].start;

    type WeekRow = { week_start: Date; revenue: string };
    const rows = await this.prisma.$queryRaw<WeekRow[]>`
      SELECT DATE_TRUNC('week', "issuedAt") AS week_start,
             COALESCE(SUM("totalAmount"), 0) AS revenue
      FROM   hospital_invoices
      WHERE  "hospitalId" = ${hospitalId}
        AND  "issuedAt" >= ${oldestStart}
      GROUP  BY DATE_TRUNC('week', "issuedAt")
      ORDER  BY week_start ASC
    `;

    const lookup = new Map<string, number>();
    for (const r of rows) {
      const dateStr = new Date(r.week_start).toISOString().split('T')[0];
      lookup.set(dateStr, Number(r.revenue));
    }

    return weeks.map(({ label, start }) => {
      const key = start.toISOString().split('T')[0];
      return {
        label,
        revenue: lookup.get(key) ?? 0,
      };
    });
  }

  async updateProfile(
    hospitalId: string,
    userId: string,
    dto: { name?: string; address?: string; phone?: string },
  ) {
    await this.validateHospitalAccess(hospitalId, userId);

    const data: Record<string, unknown> = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.address !== undefined) data.address = dto.address;
    if (dto.phone !== undefined) data.phone = dto.phone;

    const updated = await this.prisma.hospital.update({
      where: { id: hospitalId },
      data,
      include: { user: { select: { email: true } } },
    });
    const { user, ...rest } = updated;
    return { ...rest, email: user?.email ?? null };
  }

  private async validateHospitalAccess(hospitalId: string, userId: string) {
    const hospital = await this.prisma.hospital.findUnique({
      where: { id: hospitalId },
    });
    if (!hospital) {
      throw new NotFoundException('Hospital not found');
    }
    if (hospital.userId !== userId) {
      throw new ForbiddenException('You do not have access to this hospital');
    }
    return hospital;
  }

  /**
   * Read-only variant of validateHospitalAccess for endpoints a hospital's
   * own doctors should also be able to read (dashboard stats, weekly
   * revenue), not just the hospital admin who owns the account. Deliberately
   * NOT used for write endpoints (updateProfile, updateDrugStock) — a doctor
   * belonging to a hospital should be able to see its stats, not edit its
   * profile or stock.
   */
  private async validateHospitalReadAccess(hospitalId: string, userId: string) {
    const hospital = await this.prisma.hospital.findUnique({
      where: { id: hospitalId },
    });
    if (!hospital) {
      throw new NotFoundException('Hospital not found');
    }
    if (hospital.userId === userId) return hospital;

    const doctor = await this.prisma.doctor.findFirst({
      where: { userId, hospitalId },
    });
    if (doctor) return hospital;

    throw new ForbiddenException('You do not have access to this hospital');
  }

  // ========================================
  // DRUG STOCK MANAGEMENT
  // ========================================

  async getDrugStock(hospitalId: string) {
    const hospital = await this.prisma.hospital.findUnique({
      where: { id: hospitalId },
    });
    if (!hospital) throw new NotFoundException('Hospital not found');

    const stock = await this.prisma.hospitalDrugStock.findMany({
      where: { hospitalId },
      include: {
        drug: {
          select: {
            brandName: true,
            genericName: true,
            dosageStrength: true,
            dosageForm: true,
          },
        },
      },
      orderBy: { lastUpdated: 'desc' },
    });

    return stock.map((item) => ({
      ...item,
      lowStockAlert: item.quantity <= item.reorderLevel,
    }));
  }

  async updateDrugStock(
    hospitalId: string,
    drugId: string,
    dto: { qtyOnHand?: number; reorderLevel?: number },
  ) {
    const hospital = await this.prisma.hospital.findUnique({
      where: { id: hospitalId },
    });
    if (!hospital) throw new NotFoundException('Hospital not found');

    // Verify the drug stock entry exists
    const existing = await this.prisma.hospitalDrugStock.findUnique({
      where: {
        drugId_hospitalId: { drugId, hospitalId },
      },
    });
    if (!existing) {
      throw new NotFoundException('Drug not found in hospital stock inventory');
    }

    const data: Record<string, unknown> = {};
    if (dto.qtyOnHand !== undefined) data.quantity = dto.qtyOnHand;
    if (dto.reorderLevel !== undefined) data.reorderLevel = dto.reorderLevel;

    const updated = await this.prisma.hospitalDrugStock.update({
      where: {
        drugId_hospitalId: { drugId, hospitalId },
      },
      data,
      include: {
        drug: {
          select: {
            brandName: true,
            genericName: true,
            dosageStrength: true,
            dosageForm: true,
          },
        },
      },
    });

    return {
      ...updated,
      lowStockAlert: updated.quantity <= updated.reorderLevel,
    };
  }

  // ========================================
  // NEAREST PARTNER PHARMACY (haversine)
  // ========================================

  async findNearestPartnerPharmacy(
    hospitalLat: number,
    hospitalLng: number,
  ): Promise<{ id: string; name: string; distance: number } | null> {
    const pharmacies = await this.prisma.pharmacy.findMany({
      where: { status: 'APPROVED', isActive: true },
      select: {
        id: true,
        name: true,
        latitude: true,
        longitude: true,
      },
    });

    let nearest: { id: string; name: string; distance: number } | null = null;

    for (const p of pharmacies) {
      if (!p.latitude || !p.longitude) continue;
      const dist = this.calculateHaversine(
        hospitalLat,
        hospitalLng,
        p.latitude,
        p.longitude,
      );
      if (!nearest || dist < nearest.distance) {
        nearest = { id: p.id, name: p.name, distance: dist };
      }
    }

    return nearest;
  }

  private calculateHaversine(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number,
  ): number {
    const R = 6371; // km
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  // ========================================
  // GET LEAVE REQUESTS (Hospital Admin)
  // ========================================

  async getLeaveRequests(adminUserId: string, status?: string) {
    const hospital = await this.prisma.hospital.findFirst({
      where: { userId: adminUserId },
    });
    if (!hospital) throw new ForbiddenException('Hospital not found');

    const where: any = {
      doctor: { hospitalId: hospital.id },
    };

    if (status) {
      where.status = status;
    }

    return this.prisma.doctorLeave.findMany({
      where,
      include: {
        doctor: {
          select: {
            id: true,
            specialization: true,
            firstName: true,
            lastName: true,
            user: { select: { email: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ========================================
  // UPDATE LEAVE STATUS (Hospital Admin)
  // ========================================

  async updateLeaveStatus(
    adminUserId: string,
    leaveId: string,
    dto: UpdateLeaveStatusDto,
  ) {
    // Verify admin
    const hospital = await this.prisma.hospital.findFirst({
      where: { userId: adminUserId },
    });
    if (!hospital) throw new ForbiddenException('Hospital not found');

    // Fetch the leave request
    const leave = await this.prisma.doctorLeave.findUnique({
      where: { id: leaveId },
      include: {
        doctor: {
          select: {
            id: true,
            hospitalId: true,
            userId: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    if (!leave) throw new NotFoundException('Leave request not found');

    if (leave.doctor.hospitalId !== hospital.id) {
      throw new ForbiddenException(
        'This leave request does not belong to a doctor in your hospital',
      );
    }

    if (leave.status !== 'PENDING') {
      throw new BadRequestException(
        `Leave request has already been ${leave.status.toLowerCase()}`,
      );
    }

    if (dto.status === LeaveAction.REJECTED) {
      if (!dto.rejectionReason) {
        throw new BadRequestException(
          'A rejection reason is required when rejecting a leave request',
        );
      }

      const updated = await this.prisma.doctorLeave.update({
        where: { id: leaveId },
        data: { status: 'REJECTED', rejectionReason: dto.rejectionReason },
      });

      try {
        await this.notificationsService.create({
          userId: leave.doctor.userId,
          type: 'APPOINTMENT_BOOKED',
          title: 'Leave Request Rejected',
          message: `Your leave request from ${leave.startDate.toDateString()} to ${leave.endDate.toDateString()} was rejected. Reason: ${dto.rejectionReason}`,
        });
      } catch (e) {
        console.error('Failed to send leave rejection notification:', e);
      }

      return { message: 'Leave request rejected.', leave: updated };
    }

    const affectedAppointments = await this.prisma.appointment.findMany({
      where: {
        doctorId: leave.doctor.id,
        date: { gte: leave.startDate, lte: leave.endDate },
        status: { notIn: ['CANCELLED', 'COMPLETED'] },
      },
      include: {
        patient: {
          include: { user: { select: { id: true } } },
        },
        hospitalInvoice: true,
      },
    });

    // approve leave and cancel appointments
    await this.prisma.$transaction(
      async (tx) => {
        await tx.doctorLeave.update({
          where: { id: leaveId },
          data: { status: 'APPROVED' },
        });

        await tx.doctor.update({
          where: { id: leave.doctor.id },
          data: { isAvailable: false },
        });

        if (affectedAppointments.length > 0) {
          await tx.appointment.updateMany({
            where: { id: { in: affectedAppointments.map((a) => a.id) } },
            data: { status: 'CANCELLED' },
          });
        }
      },
      { timeout: 30000 },
    );

    // refunds and notifications
    const refundResults: Array<{
      appointmentId: string;
      status: 'refunded' | 'skipped' | 'failed';
      reason?: string;
    }> = [];

    for (const appointment of affectedAppointments) {
      try {
        await this.notificationsService.create({
          userId: appointment.patient.user.id,
          type: 'ORDER_CANCELLED',
          title: 'Appointment Cancelled',
          message: `Your appointment on ${appointment.date.toDateString()} with Dr. ${leave.doctor.firstName ?? ''} ${leave.doctor.lastName ?? ''} has been cancelled due to approved doctor leave.`,
        });
      } catch (e) {
        console.error(
          `Failed to send cancellation notification for appointment ${appointment.id}:`,
          e,
        );
      }

      const invoice = appointment.hospitalInvoice;
      if (!invoice || invoice.paymentStatus !== 'PAID') {
        refundResults.push({
          appointmentId: appointment.id,
          status: 'skipped',
          reason: 'No paid invoice found',
        });
        continue;
      }

      const hospitalPayments = await this.prisma.hospitalPayment.findMany({
        where: { invoiceId: invoice.id, status: 'COMPLETED' },
      });

      if (!hospitalPayments.length) {
        refundResults.push({
          appointmentId: appointment.id,
          status: 'skipped',
          reason: 'No completed hospital payment found',
        });
        continue;
      }

      for (const payment of hospitalPayments) {
        const onlineMethods = ['MTN_MOMO', 'AIRTEL_MONEY', 'CARD'];
        if (!onlineMethods.includes(payment.method)) {
          refundResults.push({
            appointmentId: appointment.id,
            status: 'skipped',
            reason: `${payment.method} requires manual refund`,
          });
          continue;
        }

        const transactionRef = payment.insuranceClaimRef;
        if (!transactionRef) {
          refundResults.push({
            appointmentId: appointment.id,
            status: 'skipped',
            reason: 'No gateway transaction reference — manual refund required',
          });
          try {
            await this.notificationsService.create({
              userId: adminUserId,
              type: 'ORDER_CANCELLED',
              title: 'Manual Refund Required',
              message: `Appointment ${appointment.id} was cancelled. Patient paid via ${payment.method} but no gateway reference is stored. Please refund manually.`,
            });
          } catch (e) {
            console.error('Failed to send manual refund notification:', e);
          }
          continue;
        }

        try {
          const refundResult =
            await this.flutterwaveService.refund(transactionRef);

          if (refundResult.status === 'success') {
            await this.prisma.hospitalPayment.update({
              where: { id: payment.id },
              data: {
                status: 'REFUNDED',
                notes: 'Refunded due to doctor leave approval',
              },
            });

            await this.prisma.hospitalInvoice.update({
              where: { id: invoice.id },
              data: { paymentStatus: 'UNPAID' },
            });

            refundResults.push({
              appointmentId: appointment.id,
              status: 'refunded',
            });

            await this.notificationsService.create({
              userId: appointment.patient.user.id,
              type: 'ORDER_CANCELLED',
              title: 'Refund Initiated',
              message: `A refund of RWF ${payment.amount.toString()} has been initiated for your cancelled appointment. It should reflect in 3–5 business days.`,
            });
          } else {
            refundResults.push({
              appointmentId: appointment.id,
              status: 'failed',
              reason: 'Gateway returned non-success status',
            });
          }
        } catch (err) {
          console.error(
            `Refund failed for appointment ${appointment.id}:`,
            err,
          );
          refundResults.push({
            appointmentId: appointment.id,
            status: 'failed',
            reason: (err as Error).message,
          });
        }
      }
    }

    // Notification for doctor
    try {
      await this.notificationsService.create({
        userId: leave.doctor.userId,
        type: 'APPOINTMENT_BOOKED',
        title: 'Leave Request Approved',
        message: `Your leave request from ${leave.startDate.toDateString()} to ${leave.endDate.toDateString()} has been approved. ${affectedAppointments.length} appointment(s) have been cancelled.`,
      });
    } catch (e) {
      console.error('Failed to send doctor leave approval notification:', e);
    }

    return {
      message:
        'Leave request approved. Affected appointments have been cancelled.',
      appointmentsCancelled: affectedAppointments.length,
      refundSummary: {
        refunded: refundResults.filter((r) => r.status === 'refunded').length,
        skipped: refundResults.filter((r) => r.status === 'skipped').length,
        failed: refundResults.filter((r) => r.status === 'failed').length,
        details: refundResults,
      },
    };
  }
}
