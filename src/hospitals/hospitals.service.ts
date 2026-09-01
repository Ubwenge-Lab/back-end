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
import { EventEmitter2 } from '@nestjs/event-emitter';
import { LogPostOpReportDto } from './dto/surgery-scheduling.dto';
import { SurgeryStatus } from '@prisma/client';

@Injectable()
export class HospitalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly flutterwaveService: FlutterwaveService,
    private readonly notificationsService: NotificationsService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

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

  async getHospitalPatients(hospitalId: string, userId: string, doctorId?: string) {
    // Ensure the user actually belongs to this hospital (Security check)
    await this.validateHospitalAccess(hospitalId, userId);

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
      mrn: reg.mrn, // for the nurse UI compatibility
      hospitalMrn: reg.mrn, // for the doctor UI compatibility
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
        AND "paymentStatus" = 'PAID'
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
        AND  "paymentStatus" = 'PAID'
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

  // ========================================
  // RECEPTIONIST PORTAL ENDPOINTS
  // ========================================

  private async validateHospitalStaffAccess(hospitalId: string, userId: string) {
    const hospital = await this.prisma.hospital.findUnique({ where: { id: hospitalId } });
    if (!hospital) throw new NotFoundException('Hospital not found');
    if (hospital.userId === userId) return hospital;

    const [doctor, staff] = await Promise.all([
      this.prisma.doctor.findFirst({ where: { userId, hospitalId } }),
      this.prisma.hospitalStaff.findFirst({ where: { userId, hospitalId } }),
    ]);
    if (doctor || staff) return hospital;

    throw new ForbiddenException('You do not have access to this hospital');
  }

  async getReceptionistQueue(hospitalId: string, userId: string) {
    await this.validateHospitalStaffAccess(hospitalId, userId);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    const appointments = await this.prisma.appointment.findMany({
      where: {
        hospitalId,
        date: { gte: today, lt: tomorrow },
        status: { in: ['SCHEDULED', 'ARRIVED', 'IN_TRIAGE', 'READY_FOR_DOCTOR'] as any },
      },
      include: {
        patient: { select: { firstName: true, lastName: true } },
        doctor: { select: { firstName: true, lastName: true, specialization: true } },
      },
      orderBy: { date: 'asc' },
    });

    return appointments.map((appt, idx) => {
      let status = 'WAITING';
      if (appt.status === 'READY_FOR_DOCTOR') status = 'CALLED';
      else if (appt.status === 'IN_TRIAGE') status = 'IN CONSULTATION';

      const now = new Date();
      const waitMs = now.getTime() - appt.date.getTime();
      const waitMinutes = Math.max(0, Math.round(waitMs / 60000));

      return {
        id: `Q-${String(idx + 1).padStart(3, '0')}`,
        name: `${appt.patient.firstName} ${appt.patient.lastName}`,
        doctor: appt.doctor
          ? `Dr. ${appt.doctor.firstName ?? ''} ${appt.doctor.lastName ?? ''}`.trim()
          : 'TBD',
        department: appt.doctor?.specialization ?? 'General',
        waitTime: appt.date < now ? `${Math.min(waitMinutes, 180)} min` : 'Upcoming',
        status,
      };
    });
  }

  async getReceptionistDashboardStats(hospitalId: string, userId: string) {
    await this.validateHospitalStaffAccess(hospitalId, userId);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    const statusRows = await this.prisma.$queryRaw<{ status: string; count: number }[]>`
      SELECT status, COUNT(*)::int AS count
      FROM appointments
      WHERE "hospitalId" = ${hospitalId}
        AND date >= ${today}
        AND date < ${tomorrow}
      GROUP BY status
    `;

    const appointmentsByStatus = { CONFIRMED: 0, PENDING: 0, COMPLETED: 0, CANCELLED: 0 };
    for (const row of statusRows) {
      const count = Number(row.count);
      if (row.status === 'SCHEDULED') {
        appointmentsByStatus.PENDING += count;
      } else if (['ARRIVED', 'IN_TRIAGE', 'READY_FOR_DOCTOR'].includes(row.status)) {
        appointmentsByStatus.CONFIRMED += count;
      } else if (row.status === 'COMPLETED') {
        appointmentsByStatus.COMPLETED += count;
      } else if (['CANCELLED', 'NO_SHOW'].includes(row.status)) {
        appointmentsByStatus.CANCELLED += count;
      }
    }

    const totalPatients = await this.prisma.hospitalPatientRegistration.count({
      where: { hospitalId },
    });

    return { appointmentsByStatus, totalPatients };
  }

  async getReceptionistDashboard(hospitalId: string, userId: string) {
    await this.validateHospitalStaffAccess(hospitalId, userId);

    const now = new Date();
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const weekStarts: Date[] = [];
    const weekLabels: string[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      d.setHours(0, 0, 0, 0);
      weekStarts.push(d);
      weekLabels.push(DAY_LABELS[d.getDay()]);
    }
    const sevenDaysAgo = weekStarts[0];

    // New patient registrations per day (last 7 days)
    const regRows = await this.prisma.$queryRaw<{ day: Date; count: number }[]>`
      SELECT DATE("registeredAt") AS day, COUNT(*)::int AS count
      FROM hospital_patient_registrations
      WHERE "hospitalId" = ${hospitalId}
        AND "registeredAt" >= ${sevenDaysAgo}
      GROUP BY DATE("registeredAt")
    `;
    const regMap = new Map(regRows.map(r => [new Date(r.day).toISOString().slice(0, 10), Number(r.count)]));
    const newPatientsWeek = weekStarts.map((d, i) => ({
      label: weekLabels[i],
      value: regMap.get(d.toISOString().slice(0, 10)) ?? 0,
    }));

    // Check-ins per day (arrived/in-triage/ready/completed, last 7 days)
    const checkinRows = await this.prisma.$queryRaw<{ day: Date; count: number }[]>`
      SELECT DATE(date) AS day, COUNT(*)::int AS count
      FROM appointments
      WHERE "hospitalId" = ${hospitalId}
        AND date >= ${sevenDaysAgo}
        AND status IN ('ARRIVED', 'IN_TRIAGE', 'READY_FOR_DOCTOR', 'COMPLETED')
      GROUP BY DATE(date)
    `;
    const checkinMap = new Map(checkinRows.map(r => [new Date(r.day).toISOString().slice(0, 10), Number(r.count)]));
    const checkinsWeek = weekStarts.map((d, i) => ({
      label: weekLabels[i],
      value: checkinMap.get(d.toISOString().slice(0, 10)) ?? 0,
    }));

    // Active queue (arrived/in-triage/ready)
    const queueAppts = await this.prisma.appointment.findMany({
      where: {
        hospitalId,
        date: { gte: today, lt: tomorrow },
        status: { in: ['ARRIVED', 'IN_TRIAGE', 'READY_FOR_DOCTOR'] as any },
      },
      include: {
        patient: { select: { firstName: true, lastName: true } },
        doctor: { select: { firstName: true, lastName: true, specialization: true } },
      },
      orderBy: { date: 'asc' },
      take: 10,
    });

    const queue = queueAppts.map((a, idx) => ({
      id: a.id,
      patientName: `${a.patient.firstName} ${a.patient.lastName}`,
      token: `T-${String(idx + 1).padStart(3, '0')}`,
      department: a.doctor?.specialization ?? 'General',
      status: a.status === 'READY_FOR_DOCTOR' ? 'IN_CONSULTATION' : 'WAITING',
    }));

    // Today's full appointment list
    const todayAppts = await this.prisma.appointment.findMany({
      where: { hospitalId, date: { gte: today, lt: tomorrow } },
      include: {
        patient: { select: { firstName: true, lastName: true } },
        doctor: { select: { firstName: true, lastName: true } },
      },
      orderBy: { date: 'asc' },
      take: 20,
    });

    const todayAppointments = todayAppts.map(a => {
      let status: 'COMPLETED' | 'UPCOMING' | 'CHECKED_IN' = 'UPCOMING';
      if (a.status === 'COMPLETED') status = 'COMPLETED';
      else if (['ARRIVED', 'IN_TRIAGE', 'READY_FOR_DOCTOR'].includes(a.status)) status = 'CHECKED_IN';

      return {
        id: a.id,
        time: a.date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }),
        patientName: `${a.patient.firstName} ${a.patient.lastName}`,
        doctorName: a.doctor
          ? `Dr. ${a.doctor.firstName ?? ''} ${a.doctor.lastName ?? ''}`.trim()
          : 'TBD',
        status,
      };
    });

    return { newPatientsWeek, checkinsWeek, queue, todayAppointments };
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



  // ========================================
  // HOSPITAL STAFF LISTING (Admin)
  // ========================================

  async getHospitalStaff(hospitalId: string, userId: string) {
    await this.validateHospitalReadAccess(hospitalId, userId);
    return this.prisma.hospitalStaff.findMany({
      where: { hospitalId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        phone: true,
        department: true,
        status: true,
        createdAt: true,
        user: { select: { email: true, role: true } },
      },
      orderBy: [{ lastName: 'asc' }],
    });
  }

  // ========================================
  // NURSE PORTAL ENDPOINTS
  // ========================================

  async getNurseDashboard(hospitalId: string, userId: string) {
    await this.validateHospitalStaffAccess(hospitalId, userId);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    const [activeAdmissions, vitalsToday, criticalAlerts, assessmentsToday] = await Promise.all([
      this.prisma.inpatientAdmission.count({
        where: { hospitalId, dischargedAt: null },
      }),
      this.prisma.inpatientVitals.count({
        where: { admission: { hospitalId }, recordedAt: { gte: today, lt: tomorrow } },
      }),
      this.prisma.mARLog.count({
        where: { admission: { hospitalId }, administeredAt: { gte: today, lt: tomorrow } },
      }),
      this.prisma.inpatientVitals.count({
        where: { admission: { hospitalId }, recordedAt: { gte: today, lt: tomorrow } },
      }),
    ]);

    return { vitalsRecordedToday: vitalsToday, activeAdmissions, medicationsAdministeredToday: criticalAlerts, newAssessmentsToday: assessmentsToday };
  }

  async getNurseVitals(hospitalId: string, userId: string, date?: string) {
    await this.validateHospitalStaffAccess(hospitalId, userId);

    const target = date ? new Date(date) : new Date();
    target.setHours(0, 0, 0, 0);
    const next = new Date(target);
    next.setDate(target.getDate() + 1);

    const vitals = await this.prisma.inpatientVitals.findMany({
      where: {
        admission: { hospitalId },
        recordedAt: { gte: target, lt: next },
      },
      include: {
        admission: { include: { patient: { select: { firstName: true, lastName: true } } } },
        nurse: { select: { firstName: true, lastName: true } },
      },
      orderBy: { recordedAt: 'desc' },
    });

    return vitals.map(v => ({
      id: v.id,
      recordedAt: v.recordedAt,
      admissionId: v.admissionId,
      patientName: `${v.admission.patient.firstName} ${v.admission.patient.lastName}`,
      nurseName: v.nurse ? `${v.nurse.firstName} ${v.nurse.lastName}` : null,
      readings: v.readings,
      nurseNotes: v.nurseNotes,
    }));
  }

  async getNurseMar(hospitalId: string, userId: string, date?: string) {
    await this.validateHospitalStaffAccess(hospitalId, userId);

    const target = date ? new Date(date) : new Date();
    target.setHours(0, 0, 0, 0);
    const next = new Date(target);
    next.setDate(target.getDate() + 1);

    const marLogs = await this.prisma.mARLog.findMany({
      where: {
        admission: { hospitalId },
        administeredAt: { gte: target, lt: next },
      },
      include: {
        admission: { include: { patient: { select: { firstName: true, lastName: true } } } },
        nurse: { select: { firstName: true, lastName: true } },
      },
      orderBy: { administeredAt: 'desc' },
    });

    return marLogs.map(m => ({
      id: m.id,
      admissionId: m.admissionId,
      patientName: `${m.admission.patient.firstName} ${m.admission.patient.lastName}`,
      medicationName: m.medicationName,
      dose: m.dose,
      route: m.route,
      administeredAt: m.administeredAt,
      scheduledAt: m.scheduledAt,
      nurseName: m.nurse ? `${m.nurse.firstName} ${m.nurse.lastName}` : null,
      notes: m.notes,
    }));
  }

  // ========================================
  // RECEPTIONIST — APPOINTMENTS
  // ========================================

  async getReceptionistAppointments(hospitalId: string, userId: string) {
    await this.validateHospitalStaffAccess(hospitalId, userId);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    const appointments = await this.prisma.appointment.findMany({
      where: { hospitalId, date: { gte: today, lt: tomorrow } },
      include: {
        patient: { select: { firstName: true, lastName: true, phone: true } },
        doctor: { select: { firstName: true, lastName: true, specialization: true } },
      },
      orderBy: { date: 'asc' },
    });

    return appointments.map(a => ({
      id: a.id,
      patientName: `${a.patient.firstName} ${a.patient.lastName}`,
      patientPhone: a.patient.phone,
      doctorName: a.doctor ? `Dr. ${a.doctor.firstName ?? ''} ${a.doctor.lastName ?? ''}`.trim() : 'TBD',
      specialty: a.doctor?.specialization ?? 'General',
      scheduledAt: a.date,
      status: a.status,
      reason: a.reason,
      type: a.type,
    }));
  }

  async updateReceptionistAppointment(
    hospitalId: string,
    userId: string,
    appointmentId: string,
    dto: { status?: string; scheduledAt?: string },
  ) {
    await this.validateHospitalStaffAccess(hospitalId, userId);

    const appt = await this.prisma.appointment.findUnique({ where: { id: appointmentId } });
    if (!appt) throw new NotFoundException('Appointment not found');
    if (appt.hospitalId !== hospitalId) throw new ForbiddenException('Appointment belongs to another hospital');

    const data: Record<string, unknown> = {};
    if (dto.status)      data.status = dto.status;
    if (dto.scheduledAt) data.date = new Date(dto.scheduledAt);

    return this.prisma.appointment.update({ where: { id: appointmentId }, data });
  }

  // ========================================
  // RECEPTIONIST — PROFILE
  // ========================================

  async getReceptionistProfile(hospitalId: string, userId: string) {
    const staff = await this.prisma.hospitalStaff.findFirst({
      where: { userId, hospitalId },
      include: { user: { select: { email: true, role: true } } },
    });
    if (!staff) throw new NotFoundException('Staff profile not found');
    return { ...staff, email: staff.user?.email ?? null, role: staff.user?.role ?? null };
  }

  async updateReceptionistProfile(
    hospitalId: string,
    userId: string,
    dto: { firstName?: string; lastName?: string; phone?: string; department?: string },
  ) {
    const staff = await this.prisma.hospitalStaff.findFirst({ where: { userId, hospitalId } });
    if (!staff) throw new NotFoundException('Staff profile not found');

    const data: Record<string, unknown> = {};
    if (dto.firstName !== undefined)  data.firstName  = dto.firstName;
    if (dto.lastName !== undefined)   data.lastName   = dto.lastName;
    if (dto.phone !== undefined)      data.phone      = dto.phone;
    if (dto.department !== undefined) data.department = dto.department;

    return this.prisma.hospitalStaff.update({ where: { id: staff.id }, data });
  }

  // ========================================
  // RECEPTIONIST — LEAVE REQUESTS
  // ========================================

  async getReceptionistLeaves(hospitalId: string, userId: string) {
    const staff = await this.prisma.hospitalStaff.findFirst({ where: { userId, hospitalId } });
    if (!staff) throw new NotFoundException('Staff profile not found');
    return this.prisma.hospitalStaffLeave.findMany({
      where: { staffId: staff.id },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createReceptionistLeave(
    hospitalId: string,
    userId: string,
    dto: { leaveType: string; startDate: string; endDate: string; reason?: string; fileName?: string },
  ) {
    const staff = await this.prisma.hospitalStaff.findFirst({ where: { userId, hospitalId } });
    if (!staff) throw new NotFoundException('Staff profile not found');
    return this.prisma.hospitalStaffLeave.create({
      data: {
        staffId:   staff.id,
        leaveType: dto.leaveType,
        startDate: new Date(dto.startDate),
        endDate:   new Date(dto.endDate),
        reason:    dto.reason,
        fileName:  dto.fileName,
      },
    });
  }

  async cancelReceptionistLeave(hospitalId: string, userId: string, leaveId: string) {
    const staff = await this.prisma.hospitalStaff.findFirst({ where: { userId, hospitalId } });
    if (!staff) throw new NotFoundException('Staff profile not found');

    const leave = await this.prisma.hospitalStaffLeave.findUnique({ where: { id: leaveId } });
    if (!leave) throw new NotFoundException('Leave request not found');
    if (leave.staffId !== staff.id) throw new ForbiddenException('Not your leave request');
    if (leave.status !== 'PENDING') throw new BadRequestException('Only PENDING leaves can be cancelled');

    return this.prisma.hospitalStaffLeave.update({ where: { id: leaveId }, data: { status: 'REJECTED' } });
  }

  // ========================================
  // RECEPTIONIST — NOTIFICATIONS
  // ========================================

  async getReceptionistNotifications(hospitalId: string, userId: string) {
    await this.validateHospitalStaffAccess(hospitalId, userId);
    return this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async markNotificationRead(hospitalId: string, userId: string, notifId: string) {
    await this.validateHospitalStaffAccess(hospitalId, userId);
    const notif = await this.prisma.notification.findUnique({ where: { id: notifId } });
    if (!notif || notif.userId !== userId) throw new NotFoundException('Notification not found');
    return this.prisma.notification.update({ where: { id: notifId }, data: { isRead: true } });
  }

  async markAllNotificationsRead(hospitalId: string, userId: string) {
    await this.validateHospitalStaffAccess(hospitalId, userId);
    await this.prisma.notification.updateMany({ where: { userId, isRead: false }, data: { isRead: true } });
    return { message: 'All notifications marked as read' };
  }

  // ========================================
  // SURGERY MANAGEMENT (Post-Op & Inventory)
  // ========================================

  async logPostOpReport(
    hospitalId: string,
    userId: string,
    bookingId: string,
    dto: LogPostOpReportDto,
  ) {
    await this.validateHospitalAccess(hospitalId, userId);

    const booking = await this.prisma.surgeryBooking.findUnique({
      where: { id: bookingId },
    });

    if (!booking) {
      throw new NotFoundException('Surgery booking not found');
    }

    if (booking.hospitalId !== hospitalId) {
      throw new ForbiddenException('This booking belongs to another hospital');
    }

    if (booking.status === SurgeryStatus.COMPLETED) {
      throw new BadRequestException('Surgery is already marked as completed');
    }

    const updatedBooking = await this.prisma.surgeryBooking.update({
      where: { id: bookingId },
      data: {
        status: SurgeryStatus.COMPLETED,
        durationMinutes: dto.durationMinutes,
        anesthesiaDetails: dto.anesthesiaDetails,
        operationNotes: dto.operationNotes,
        complications: dto.complications,
        outcome: dto.outcome,
        reportLoggedAt: new Date(),
      },
    });

    this.eventEmitter.emit('surgery.completed', {
      bookingId: updatedBooking.id,
    });

    return updatedBooking;
  }

  // ========================================
  // NURSE SCHEDULE (derived from handovers)
  // ========================================

  async getNurseSchedule(
    hospitalId: string,
    userId: string,
    view: string,
    date?: string,
  ) {
    await this.validateHospitalStaffAccess(hospitalId, userId);

    const staff = await this.prisma.hospitalStaff.findFirst({
      where: { userId, hospitalId },
    });
    if (!staff) throw new NotFoundException('Staff profile not found');

    const baseDate = date ? new Date(date) : new Date();
    baseDate.setHours(0, 0, 0, 0);

    if (view === 'weekly') {
      // Return the 7-day window starting from Monday of the given week
      const dayOfWeek = baseDate.getDay();
      const monday = new Date(baseDate);
      monday.setDate(baseDate.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 7);

      const handovers = await this.prisma.nursingHandover.findMany({
        where: {
          admission: { hospitalId },
          OR: [{ handedOverById: staff.id }, { receivedById: staff.id }],
          handedOverAt: { gte: monday, lt: sunday },
        },
        include: {
          admission: { include: { patient: { select: { firstName: true, lastName: true } } } },
        },
        orderBy: { handedOverAt: 'asc' },
      });

      return handovers.map((h) => ({
        id: h.id,
        time: new Date(h.handedOverAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        title: `${h.shiftType} Shift Handover — ${h.admission.patient.firstName} ${h.admission.patient.lastName}`,
        description: h.notes ?? '',
        status: 'COMPLETED',
        date: h.handedOverAt,
      }));
    }

    if (view === 'monthly') {
      const firstDay = new Date(baseDate.getFullYear(), baseDate.getMonth(), 1);
      const lastDay = new Date(baseDate.getFullYear(), baseDate.getMonth() + 1, 0, 23, 59, 59);

      const handovers = await this.prisma.nursingHandover.findMany({
        where: {
          admission: { hospitalId },
          OR: [{ handedOverById: staff.id }, { receivedById: staff.id }],
          handedOverAt: { gte: firstDay, lte: lastDay },
        },
        orderBy: { handedOverAt: 'asc' },
      });

      return handovers.map((h) => ({
        id: h.id,
        time: new Date(h.handedOverAt).toLocaleDateString([], { month: 'short', day: 'numeric' }),
        title: `${h.shiftType} Shift Handover`,
        description: h.notes ?? '',
        status: 'COMPLETED',
        date: h.handedOverAt,
      }));
    }

    // Default: daily view
    const next = new Date(baseDate);
    next.setDate(baseDate.getDate() + 1);

    const [handovers, vitals] = await Promise.all([
      this.prisma.nursingHandover.findMany({
        where: {
          admission: { hospitalId },
          OR: [{ handedOverById: staff.id }, { receivedById: staff.id }],
          handedOverAt: { gte: baseDate, lt: next },
        },
        include: {
          admission: { include: { patient: { select: { firstName: true, lastName: true } } } },
        },
        orderBy: { handedOverAt: 'asc' },
      }),
      this.prisma.inpatientVitals.findMany({
        where: {
          recordedById: staff.id,
          recordedAt: { gte: baseDate, lt: next },
        },
        include: {
          admission: { include: { patient: { select: { firstName: true, lastName: true } } } },
        },
        orderBy: { recordedAt: 'asc' },
      }),
    ]);

    const items = [
      ...handovers.map((h) => ({
        id: h.id,
        time: new Date(h.handedOverAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        title: `${h.shiftType} Shift Handover`,
        description: `Patient: ${h.admission.patient.firstName} ${h.admission.patient.lastName}${h.notes ? ' — ' + h.notes : ''}`,
        status: 'COMPLETED' as const,
        date: h.handedOverAt,
      })),
      ...vitals.map((v) => ({
        id: v.id,
        time: new Date(v.recordedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        title: 'Vitals Recorded',
        description: `Patient: ${v.admission.patient.firstName} ${v.admission.patient.lastName}`,
        status: 'COMPLETED' as const,
        date: v.recordedAt,
      })),
    ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    return items;
  }

  // ========================================
  // NURSE NOTES
  // ========================================

  async getNurseNotes(
    hospitalId: string,
    userId: string,
    date?: string,
    patientId?: string,
  ) {
    await this.validateHospitalStaffAccess(hospitalId, userId);

    const where: Record<string, unknown> = { hospitalId };
    if (patientId) where.patientId = patientId;

    if (date) {
      const d = new Date(date);
      d.setHours(0, 0, 0, 0);
      const next = new Date(d);
      next.setDate(d.getDate() + 1);
      where.noteDate = { gte: d, lt: next };
    }

    const notes = await this.prisma.nursingNote.findMany({
      where,
      include: {
        staff: { select: { firstName: true, lastName: true } },
        patient: { select: { firstName: true, lastName: true } },
      },
      orderBy: { noteDate: 'desc' },
      take: 100,
    });

    return notes.map((n) => ({
      id: n.id,
      patientName: n.patient
        ? `${n.patient.firstName} ${n.patient.lastName}`
        : 'Unknown Patient',
      nurseName: n.staff ? `${n.staff.firstName} ${n.staff.lastName}` : 'Unknown Nurse',
      date: n.noteDate.toISOString().split('T')[0],
      time: n.noteDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      observationNotes: n.observationNotes,
      careActivities: n.careActivities ?? '',
      additionalComments: n.additionalComments ?? '',
    }));
  }

  async createNurseNote(
    hospitalId: string,
    userId: string,
    dto: {
      patientId?: string;
      observationNotes: string;
      careActivities?: string;
      additionalComments?: string;
      noteDate?: string;
    },
  ) {
    await this.validateHospitalStaffAccess(hospitalId, userId);

    const staff = await this.prisma.hospitalStaff.findFirst({
      where: { userId, hospitalId },
    });
    if (!staff) throw new NotFoundException('Staff profile not found');

    const note = await this.prisma.nursingNote.create({
      data: {
        hospitalId,
        staffId: staff.id,
        patientId: dto.patientId ?? null,
        observationNotes: dto.observationNotes,
        careActivities: dto.careActivities ?? null,
        additionalComments: dto.additionalComments ?? null,
        noteDate: dto.noteDate ? new Date(dto.noteDate) : new Date(),
      },
      include: {
        staff: { select: { firstName: true, lastName: true } },
        patient: { select: { firstName: true, lastName: true } },
      },
    });

    return {
      id: note.id,
      patientName: note.patient
        ? `${note.patient.firstName} ${note.patient.lastName}`
        : 'Unknown Patient',
      nurseName: `${note.staff.firstName} ${note.staff.lastName}`,
      date: note.noteDate.toISOString().split('T')[0],
      time: note.noteDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      observationNotes: note.observationNotes,
      careActivities: note.careActivities ?? '',
      additionalComments: note.additionalComments ?? '',
    };
  }

  // ========================================
  // NURSE PROFILE
  // ========================================

  async getNurseProfile(hospitalId: string, userId: string) {
    await this.validateHospitalStaffAccess(hospitalId, userId);
    const staff = await this.prisma.hospitalStaff.findFirst({
      where: { userId, hospitalId },
      include: { user: { select: { email: true, role: true } } },
    });
    if (!staff) throw new NotFoundException('Staff profile not found');
    return { ...staff, email: staff.user?.email ?? null, role: staff.user?.role ?? null };
  }

  // ========================================
  // INVOICE SUMMARY (Finance KPIs)
  // ========================================

  async getInvoiceSummary(hospitalId: string, userId: string) {
    await this.validateHospitalReadAccess(hospitalId, userId);

    const [invoices, payments] = await Promise.all([
      this.prisma.hospitalInvoice.findMany({
        where: { hospitalId },
        select: { totalAmount: true, paymentStatus: true, issuedAt: true },
      }),
      this.prisma.hospitalPayment.findMany({
        where: { invoice: { hospitalId }, status: 'COMPLETED' },
        select: { amount: true, paidAt: true },
      }),
    ]);

    const totalRevenue = payments.reduce((s, p) => s + Number(p.amount), 0);
    const pendingInvoices = invoices.filter((i) => i.paymentStatus === 'UNPAID');
    const pendingAmount = pendingInvoices.reduce((s, i) => s + Number(i.totalAmount), 0);
    const insurancePending = invoices.filter((i) => i.paymentStatus === 'INSURANCE_PENDING');
    const insuranceAmount = insurancePending.reduce((s, i) => s + Number(i.totalAmount), 0);

    return {
      totalRevenue,
      totalRevenueFormatted: `RWF ${totalRevenue.toLocaleString()}`,
      pendingPayments: pendingAmount,
      pendingPaymentsFormatted: `RWF ${pendingAmount.toLocaleString()}`,
      pendingInvoiceCount: pendingInvoices.length,
      insurancePending: insuranceAmount,
      insurancePendingFormatted: `RWF ${insuranceAmount.toLocaleString()}`,
      insurancePendingCount: insurancePending.length,
      totalInvoices: invoices.length,
    };
  }

  // ========================================
  // HOSPITAL FEES
  // ========================================

  async getHospitalFees(hospitalId: string, userId: string) {
    await this.validateHospitalReadAccess(hospitalId, userId);
    return this.prisma.hospitalFee.findMany({
      where: { hospitalId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async createHospitalFee(
    hospitalId: string,
    userId: string,
    dto: { service: string; price: number; status?: string },
  ) {
    await this.validateHospitalAccess(hospitalId, userId);
    return this.prisma.hospitalFee.create({
      data: {
        hospitalId,
        service: dto.service,
        price: dto.price,
        status: dto.status ?? 'Active',
      },
    });
  }

  async updateHospitalFee(
    hospitalId: string,
    userId: string,
    feeId: string,
    dto: { service?: string; price?: number; status?: string },
  ) {
    await this.validateHospitalAccess(hospitalId, userId);
    const fee = await this.prisma.hospitalFee.findUnique({ where: { id: feeId } });
    if (!fee || fee.hospitalId !== hospitalId) throw new NotFoundException('Fee not found');
    const data: Record<string, unknown> = {};
    if (dto.service !== undefined) data.service = dto.service;
    if (dto.price !== undefined)   data.price   = dto.price;
    if (dto.status !== undefined)  data.status  = dto.status;
    return this.prisma.hospitalFee.update({ where: { id: feeId }, data });
  }

  async deleteHospitalFee(hospitalId: string, userId: string, feeId: string) {
    await this.validateHospitalAccess(hospitalId, userId);
    const fee = await this.prisma.hospitalFee.findUnique({ where: { id: feeId } });
    if (!fee || fee.hospitalId !== hospitalId) throw new NotFoundException('Fee not found');
    await this.prisma.hospitalFee.delete({ where: { id: feeId } });
    return { message: 'Fee deleted' };
  }

  // ========================================
  // HOSPITAL ANNOUNCEMENTS
  // ========================================

  async getHospitalAnnouncements(hospitalId: string, userId: string) {
    await this.validateHospitalReadAccess(hospitalId, userId);
    return this.prisma.hospitalAnnouncement.findMany({
      where: { hospitalId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createHospitalAnnouncement(
    hospitalId: string,
    userId: string,
    dto: { title: string; type?: string; message?: string },
  ) {
    await this.validateHospitalAccess(hospitalId, userId);
    return this.prisma.hospitalAnnouncement.create({
      data: {
        hospitalId,
        title: dto.title,
        type: dto.type ?? 'General',
        message: dto.message ?? null,
      },
    });
  }

  async deleteHospitalAnnouncement(hospitalId: string, userId: string, annId: string) {
    await this.validateHospitalAccess(hospitalId, userId);
    const ann = await this.prisma.hospitalAnnouncement.findUnique({ where: { id: annId } });
    if (!ann || ann.hospitalId !== hospitalId) throw new NotFoundException('Announcement not found');
    await this.prisma.hospitalAnnouncement.delete({ where: { id: annId } });
    return { message: 'Announcement deleted' };
  }

  // ========================================
  // HOSPITAL STAFF MESSAGES
  // ========================================

  async getHospitalMessages(hospitalId: string, userId: string) {
    await this.validateHospitalStaffAccess(hospitalId, userId);

    const messages = await this.prisma.hospitalStaffMessage.findMany({
      where: { hospitalId },
      include: {
        sender: { select: { firstName: true, lastName: true, department: true, user: { select: { role: true } } } },
      },
      orderBy: { createdAt: 'asc' },
      take: 200,
    });

    return messages.map((m) => ({
      id: m.id,
      senderName: `${m.sender.firstName} ${m.sender.lastName}`,
      senderRole: m.sender.user?.role ?? 'NURSE',
      initials: `${m.sender.firstName[0]}${m.sender.lastName[0]}`.toUpperCase(),
      content: m.content,
      isRead: m.isRead,
      createdAt: m.createdAt,
    }));
  }

  async sendHospitalMessage(
    hospitalId: string,
    userId: string,
    content: string,
  ) {
    await this.validateHospitalStaffAccess(hospitalId, userId);

    const staff = await this.prisma.hospitalStaff.findFirst({
      where: { userId, hospitalId },
    });
    if (!staff) throw new NotFoundException('Staff profile not found');

    const msg = await this.prisma.hospitalStaffMessage.create({
      data: { hospitalId, senderId: staff.id, content },
      include: {
        sender: { select: { firstName: true, lastName: true, user: { select: { role: true } } } },
      },
    });

    return {
      id: msg.id,
      senderName: `${msg.sender.firstName} ${msg.sender.lastName}`,
      senderRole: msg.sender.user?.role ?? 'NURSE',
      initials: `${msg.sender.firstName[0]}${msg.sender.lastName[0]}`.toUpperCase(),
      content: msg.content,
      isRead: msg.isRead,
      createdAt: msg.createdAt,
    };
  }

  // ========================================
  // WALK-IN APPOINTMENT (Receptionist)
  // ========================================

  async createWalkIn(
    hospitalId: string,
    userId: string,
    dto: {
      patientId: string;
      department?: string;
      visitReason?: string;
      insuranceProvider?: string;
      doctorId?: string;
    },
  ) {
    await this.validateHospitalStaffAccess(hospitalId, userId);

    const hospital = await this.prisma.hospital.findUnique({ where: { id: hospitalId } });
    if (!hospital) throw new NotFoundException('Hospital not found');

    const patient = await this.prisma.patient.findUnique({ where: { id: dto.patientId } });
    if (!patient) throw new NotFoundException('Patient not found');

    // Find a doctor in the requested department/specialization, or the first available
    let doctorId = dto.doctorId;
    if (!doctorId) {
      const doctor = await this.prisma.doctor.findFirst({
        where: {
          hospitalId,
          isAvailable: true,
          ...(dto.department ? { specialization: { contains: dto.department, mode: 'insensitive' } } : {}),
        },
      });
      doctorId = doctor?.id;
    }

    if (!doctorId) {
      throw new BadRequestException('No available doctor found for this department. Please assign manually.');
    }

    const queueNumber = `WK-${String(Math.floor(Math.random() * 900) + 100)}`;

    const appointment = await this.prisma.appointment.create({
      data: {
        patientId: dto.patientId,
        doctorId,
        hospitalId,
        date: new Date(),
        status: 'ARRIVED',
        reason: dto.visitReason ?? 'Walk-in',
        type: 'IN_PERSON',
        notes: `Walk-in | ${dto.insuranceProvider ? 'Insurance: ' + dto.insuranceProvider : 'Self-pay'} | Queue: ${queueNumber}`,
      },
    });

    return { appointmentId: appointment.id, queueNumber, status: appointment.status };
  }
}
