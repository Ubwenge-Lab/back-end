import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { generateMRN } from '../utils/hospital';

@Injectable()
export class HospitalsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    return this.prisma.hospital.findMany({
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string) {
    const hospital = await this.prisma.hospital.findUnique({ where: { id } });
    if (!hospital) throw new NotFoundException('Hospital not found');
    return hospital;
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
        user: {
          include: {
            hospitalStaff: {
              select: { firstName: true, lastName: true, phone: true },
            },
          },
        },
      },
      orderBy: [{ rating: 'desc' }, { specialization: 'asc' }],
    });
  }

  async getStats(hospitalId: string, userId: string) {
    await this.validateHospitalAccess(hospitalId, userId);

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

    for (const row of statusRows) {
      const status = row.status;
      const count = Number(row.count);
      if (status === 'SCHEDULED') {
        appointmentsByStatus.PENDING = count;
      } else if (status === 'COMPLETED') {
        appointmentsByStatus.COMPLETED = count;
      } else if (status === 'CANCELLED') {
        appointmentsByStatus.CANCELLED = count;
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
    await this.validateHospitalAccess(hospitalId, userId);

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
}
