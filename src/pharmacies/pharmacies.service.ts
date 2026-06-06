// backend/src/pharmacies/pharmacies.service.ts
// COMPLETE VERSION - With Stats, Analytics, and Patients Viewing

import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdatePharmacyDto } from './dto/update-pharmacy.dto';
import { EmailService } from '../notifications/email.service';
import { toPharmacyLocationDto } from './utils/pharmacy.mapper';
import { getDistrict } from '../triangulation/triangulation.helpers';

@Injectable()
export class PharmaciesService {
  constructor(
    private prisma: PrismaService,
    private emailService: EmailService,
  ) {}

  // ========================================
  // DASHBOARD STATISTICS
  // ========================================

  async getStats(userId: string) {
    const pharmacy = await this.findByUserId(userId);

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

    // total branches adn total employees
    const [totalBranches, totalEmployees] = await Promise.all([
      this.prisma.branch.count({
        where: { pharmacyId: pharmacy.id },
      }),
      this.prisma.staff.count({
        where: {
          branch: { pharmacyId: pharmacy.id },
          status: 'ACTIVE',
        },
      }),
    ]);

    // Revenue total
    const [monthlyRevenueResult, totalRevenueResult] = await Promise.all([
      this.prisma.order.aggregate({
        where: {
          pharmacyId: pharmacy.id,
          status: 'COMPLETED',
          createdAt: { gte: startOfMonth, lte: endOfMonth },
        },
        _sum: { total: true },
      }),
      this.prisma.order.aggregate({
        where: {
          pharmacyId: pharmacy.id,
          status: 'COMPLETED',
        },
        _sum: { total: true },
      }),
    ]);

    const monthlyRevenue = monthlyRevenueResult._sum.total ?? 0;
    const totalRevenue = totalRevenueResult._sum.total ?? 0;

    // ── Revenue over time: 1 GROUP BY query replaces 6 sequential round-trips ──
    type MonthRevRow = { month_label: string; revenue: string };
    const monthRevRows = await this.prisma.$queryRaw<MonthRevRow[]>`
      SELECT TO_CHAR(DATE_TRUNC('month', "createdAt"), 'Mon') AS month_label,
             COALESCE(SUM(total), 0)                          AS revenue
      FROM   orders
      WHERE  "pharmacyId" = ${pharmacy.id}
        AND  status       = 'COMPLETED'
        AND  "createdAt" >= NOW() - INTERVAL '6 months'
      GROUP  BY DATE_TRUNC('month', "createdAt")
      ORDER  BY DATE_TRUNC('month', "createdAt") ASC
    `;
    const revenueOverTime = monthRevRows.map((r) => ({
      month: r.month_label,
      revenue: Number(r.revenue),
    }));

    // Fetch branches (needed for name resolution below)
    const branches = await this.prisma.branch.findMany({
      where: { pharmacyId: pharmacy.id },
      select: { id: true, name: true },
    });

    // ── Revenue by branch: 1 GROUP BY query replaces N sequential aggregates ──
    type BranchRevRow = { branchId: string; revenue: string };
    const branchRevRows = await this.prisma.$queryRaw<BranchRevRow[]>`
      SELECT "branchId",
             COALESCE(SUM(total), 0) AS revenue
      FROM   orders
      WHERE  "pharmacyId" = ${pharmacy.id}
        AND  status       = 'COMPLETED'
        AND  "createdAt" >= ${startOfMonth}
        AND  "createdAt" <= ${endOfMonth}
      GROUP  BY "branchId"
    `;
    const branchRevMap = new Map(
      branchRevRows.map((r) => [r.branchId, Number(r.revenue)]),
    );
    const revenueByBranch = branches.map((b) => ({
      name: b.name,
      revenue: branchRevMap.get(b.id) ?? 0,
    }));

    // ── Medication count per branch: 1 GROUP BY query ──
    type BranchMedRow = { branchId: string; value: string };
    const branchMedRows = await this.prisma.$queryRaw<BranchMedRow[]>`
      SELECT "branchId", COUNT(*)::text AS value
      FROM   medications
      WHERE  "pharmacyId" = ${pharmacy.id}
      GROUP  BY "branchId"
    `;
    const branchMedMap = new Map(
      branchMedRows.map((r) => [r.branchId, Number(r.value)]),
    );
    const inventoryDistribution = branches.map((b) => ({
      name: b.name,
      value: branchMedMap.get(b.id) ?? 0,
    }));

    // low stock alerts
    const lowStockMeds = await this.prisma.medication.findMany({
      where: {
        pharmacyId: pharmacy.id,
        quantity: { lte: 10, gt: 0 },
      },
      select: {
        name: true,
        quantity: true,
        branch: { select: { name: true } },
      },
    });

    const pendingBranches = await this.prisma.branch.count({
      where: {
        pharmacyId: pharmacy.id,
        branchStatus: 'PENDING',
      },
    });

    const alerts: {
      branch: string;
      msg: string;
      level: 'warning' | 'info';
      meds?: { name: string; quantity: number }[];
    }[] = [];

    const lowStockByBranch: Record<
      string,
      { name: string; quantity: number }[]
    > = lowStockMeds.reduce((acc, med) => {
      const branchName = med.branch.name;
      if (!acc[branchName]) acc[branchName] = [];
      acc[branchName].push({ name: med.name, quantity: med.quantity });
      return acc;
    }, {});

    for (const [branchName, meds] of Object.entries(lowStockByBranch)) {
      alerts.push({
        branch: branchName,
        msg: `Low stock: ${meds.length} medication${meds.length > 1 ? 's' : ''} below threshold`,
        level: 'warning',
        meds,
      });
    }

    if (pendingBranches > 0) {
      alerts.push({
        branch: 'Branch Management',
        msg: `${pendingBranches} branch${pendingBranches > 1 ? 'es' : ''} pending approval`,
        level: 'info',
      });
    }

    return {
      totalBranches,
      totalEmployees,
      monthlyRevenue,
      totalRevenue,
      revenueOverTime,
      revenueByBranch,
      inventoryDistribution,
      alerts,
    };
  }

  async getBranchStats(managerUserId: string) {
    const branch = await this.prisma.branch.findUnique({
      where: { managerId: managerUserId },
    });

    if (!branch) {
      throw new ForbiddenException(
        'Only branch managers can access branch stats',
      );
    }

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

    // For attendance (today)
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    const [
      orderCount,
      revenueResult,
      lowStockCount,
      staffCount,
      attendanceCount,
    ] = await Promise.all([
      // 1. Order Count this month
      this.prisma.order.count({
        where: {
          branchId: branch.id,
          createdAt: { gte: startOfMonth, lte: endOfMonth },
        },
      }),
      // 2. Revenue this month
      this.prisma.order.aggregate({
        where: {
          branchId: branch.id,
          status: 'COMPLETED',
          createdAt: { gte: startOfMonth, lte: endOfMonth },
        },
        _sum: { total: true },
      }),
      // 3. Low stock medications
      this.prisma.medication.count({
        where: {
          branchId: branch.id,
          quantity: { lte: 10, gt: 0 },
        },
      }),
      // 4. Staff count
      this.prisma.staff.count({
        where: { branchId: branch.id, status: 'ACTIVE' },
      }),
      // 5. Attendance Summary (Present today)
      this.prisma.attendance.count({
        where: {
          staff: { branchId: branch.id },
          clockInTime: { gte: startOfDay, lte: endOfDay },
          status: 'APPROVED',
        },
      }),
    ]);

    return {
      orderCount,
      revenue: revenueResult._sum.total ?? 0,
      lowStockCount,
      staffCount,
      attendanceCount,
    };
  }

  // ========================================
  // DAILY REVENUE — last 30 days, per branch
  // ========================================

  async getDailyRevenue(userId: string) {
    const pharmacy = await this.findByUserId(userId);

    const now = new Date();
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(now.getDate() - 29);
    thirtyDaysAgo.setHours(0, 0, 0, 0);

    // Build the day-label array for the response shape (CPU-only, no DB)
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

    // ── SINGLE QUERY: replaces 30 + (30×N_branches) sequential aggregates ──
    type DailyRow = { day: Date; branchId: string; revenue: string };
    const rows = await this.prisma.$queryRaw<DailyRow[]>`
      SELECT DATE_TRUNC('day', "createdAt") AS day,
             "branchId",
             COALESCE(SUM(total), 0)        AS revenue
      FROM   orders
      WHERE  "pharmacyId" = ${pharmacy.id}
        AND  status       = 'COMPLETED'
        AND  "createdAt" >= ${thirtyDaysAgo}
      GROUP  BY DATE_TRUNC('day', "createdAt"), "branchId"
      ORDER  BY day ASC
    `;

    // Build in-memory lookup: dateStr → { branchId → revenue }
    const lookup = new Map<string, Map<string, number>>();
    for (const r of rows) {
      const dateStr = new Date(r.day).toISOString().split('T')[0];
      if (!lookup.has(dateStr)) lookup.set(dateStr, new Map());
      lookup.get(dateStr).set(r.branchId, Number(r.revenue));
    }

    // Pharmacy-wide daily totals (sum across all branches for each day)
    const dailyTotal = days.map(({ date, label }) => {
      const branchMap = lookup.get(date);
      const revenue = branchMap
        ? Array.from(branchMap.values()).reduce((s, v) => s + v, 0)
        : 0;
      return { date, label, revenue };
    });

    // Fetch branch names for the per-branch breakdown
    const branches = await this.prisma.branch.findMany({
      where: { pharmacyId: pharmacy.id },
      select: { id: true, name: true },
    });

    const branchDaily = branches.map((branch) => ({
      branchId: branch.id,
      branchName: branch.name,
      data: days.map(({ date, label }) => ({
        date,
        label,
        revenue: lookup.get(date)?.get(branch.id) ?? 0,
      })),
    }));

    return {
      days: days.map((d) => d.label),
      dailyTotal,
      branchDaily,
    };
  }

  // ========================================
  // WEEKLY REVENUE — last 30 days, per branch
  // ========================================

  async getWeeklyRevenue(userId: string) {
    const pharmacy = await this.findByUserId(userId);

    const now = new Date();

    // Build 4 complete weeks going backwards from today
    const weeks: { label: string; start: Date; end: Date }[] = [];
    for (let w = 3; w >= 0; w--) {
      const end = new Date(now);
      end.setDate(now.getDate() - w * 7);
      end.setHours(23, 59, 59, 999);
      const start = new Date(end);
      start.setDate(end.getDate() - 6);
      start.setHours(0, 0, 0, 0);
      const label = `${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
      weeks.push({ label, start, end });
    }

    const oldestStart = weeks[0].start;

    // ── SINGLE QUERY: replaces 4 + (4×N_branches) sequential aggregates ──
    type WeekRow = { week_start: Date; branchId: string; revenue: string };
    const rows = await this.prisma.$queryRaw<WeekRow[]>`
      SELECT DATE_TRUNC('week', "createdAt") AS week_start,
             "branchId",
             COALESCE(SUM(total), 0)         AS revenue
      FROM   orders
      WHERE  "pharmacyId" = ${pharmacy.id}
        AND  status       = 'COMPLETED'
        AND  "createdAt" >= ${oldestStart}
      GROUP  BY DATE_TRUNC('week', "createdAt"), "branchId"
      ORDER  BY week_start ASC
    `;

    // Build in-memory lookup: ISO week-start string → { branchId → revenue }
    const lookup = new Map<string, Map<string, number>>();
    for (const r of rows) {
      const key = new Date(r.week_start).toISOString();
      if (!lookup.has(key)) lookup.set(key, new Map());
      lookup.get(key).set(r.branchId, Number(r.revenue));
    }

    // Resolve each week to its lookup key (normalize to Monday 00:00:00 UTC)
    const weekKeys = weeks.map((w) => {
      const d = new Date(w.start);
      d.setUTCHours(0, 0, 0, 0);
      return d.toISOString();
    });

    const weeklyTotal = weeks.map(({ label }, i) => {
      const branchMap = lookup.get(weekKeys[i]);
      const revenue = branchMap
        ? Array.from(branchMap.values()).reduce((s, v) => s + v, 0)
        : 0;
      return { label, revenue };
    });

    const branches = await this.prisma.branch.findMany({
      where: { pharmacyId: pharmacy.id },
      select: { id: true, name: true },
    });

    const branchWeekly = branches.map((branch) => ({
      branchId: branch.id,
      branchName: branch.name,
      data: weeks.map(({ label }, i) => ({
        label,
        revenue: lookup.get(weekKeys[i])?.get(branch.id) ?? 0,
      })),
    }));

    return {
      weeks: weeks.map((w) => w.label),
      weeklyTotal,
      branchWeekly,
    };
  }

  // ========================================
  // ANALYTICS DATA
  // ========================================

  async getAnalytics(userId: string) {
    const pharmacy = await this.findByUserId(userId);

    const now = new Date();
    const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfLastMonth = new Date(
      now.getFullYear(),
      now.getMonth(),
      0,
      23,
      59,
      59,
      999,
    );

    // ── Single GROUP BY query replaces unbounded findMany + in-memory filter ──
    type MonthRow = {
      month: Date;
      total_revenue: string;
      total_orders: string;
      items_sold: string;
    };

    const rows = await this.prisma.$queryRaw<MonthRow[]>`
      SELECT
        DATE_TRUNC('month', o."createdAt")   AS month,
        COALESCE(SUM(o.total), 0)            AS total_revenue,
        COUNT(DISTINCT o.id)                 AS total_orders,
        COALESCE(SUM(oi.quantity), 0)        AS items_sold
      FROM orders o
      LEFT JOIN order_items oi ON oi."orderId" = o.id
      WHERE o."pharmacyId" = ${pharmacy.id}
        AND o."createdAt" >= ${startOfLastMonth}
      GROUP BY DATE_TRUNC('month', o."createdAt")
      ORDER BY month ASC
    `;

    const thisMonth = rows.find((r) => new Date(r.month) >= startOfThisMonth);
    const lastMonth = rows.find(
      (r) =>
        new Date(r.month) >= startOfLastMonth &&
        new Date(r.month) < startOfThisMonth,
    );

    const totalRevenue = Number(thisMonth?.total_revenue ?? 0);
    const totalOrders = Number(thisMonth?.total_orders ?? 0);
    const avgOrderValue =
      totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0;
    const itemsSold = Number(thisMonth?.items_sold ?? 0);

    const prevRevenue = Number(lastMonth?.total_revenue ?? 0);
    const prevOrders = Number(lastMonth?.total_orders ?? 0);
    const prevAvgOrder =
      prevOrders > 0 ? Math.round(prevRevenue / prevOrders) : 0;
    const prevItemsSold = Number(lastMonth?.items_sold ?? 0);

    const pct = (cur: number, prev: number) =>
      prev > 0 ? Math.round(((cur - prev) / prev) * 100) : 0;

    return {
      totalRevenue,
      totalOrders,
      avgOrderValue,
      itemsSold,
      revenueChange: pct(totalRevenue, prevRevenue),
      ordersChange: pct(totalOrders, prevOrders),
      avgValueChange: pct(avgOrderValue, prevAvgOrder),
      itemsChange: pct(itemsSold, prevItemsSold),
    };
  }

  // ========================================
  // VIEW ALL PAST PATIENTS
  // ========================================

  async getPatients(userId: string, page = 1, limit = 20) {
    const pharmacy = await this.findByUserId(userId);
    const skip = (page - 1) * limit;

    // Paginated query — avoids loading all orders + all items into memory
    const [total, patientRows] = await Promise.all([
      this.prisma.patient.count({
        where: { orders: { some: { pharmacyId: pharmacy.id } } },
      }),
      this.prisma.patient.findMany({
        where: { orders: { some: { pharmacyId: pharmacy.id } } },
        skip,
        take: limit,
        select: {
          id: true,
          firstName: true,
          lastName: true,
          phone: true,
          user: { select: { email: true } },
          orders: {
            where: { pharmacyId: pharmacy.id },
            orderBy: { createdAt: 'desc' },
            select: {
              id: true,
              orderNumber: true,
              status: true,
              total: true,
              createdAt: true,
              _count: { select: { orderItems: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    const patients = patientRows.map((p) => ({
      id: p.id,
      firstName: p.firstName,
      lastName: p.lastName,
      email: p.user.email,
      phone: p.phone,
      totalOrders: p.orders.length,
      totalSpent: p.orders.reduce((s, o) => s + o.total, 0),
      lastOrderDate: p.orders[0]?.createdAt ?? null,
      orders: p.orders.map((o) => ({
        id: o.id,
        orderNumber: o.orderNumber,
        status: o.status,
        total: o.total,
        createdAt: o.createdAt,
        itemCount: o._count.orderItems,
      })),
    }));

    return {
      totalPatients: total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      patients,
    };
  }

  // ========================================
  // FIND ALL PHARMACIES
  // ========================================

  async findAll(status?: string) {
    const where = status ? { status: status as any } : {};

    return this.prisma.pharmacy.findMany({
      where,
      include: {
        user: {
          select: { email: true },
        },
        _count: {
          select: { medications: true, orders: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ========================================
  // FIND PHARMACY BY ID
  // ========================================

  async findById(id: string) {
    const pharmacy = await this.prisma.pharmacy.findUnique({
      where: { id },
      include: {
        user: {
          select: { email: true },
        },
        medications: true,
        _count: {
          select: { orders: true },
        },
      },
    });

    if (pharmacy) return pharmacy;

    // If not a main pharmacy, check if it's a branch
    const branch = await this.prisma.branch.findUnique({
      where: { id },
      include: {
        pharmacy: {
          include: {
            user: {
              select: { email: true },
            },
          },
        },
        medications: true,
      },
    });

    if (!branch) {
      throw new NotFoundException('Pharmacy or Branch not found');
    }

    // Unify branch response to look like a pharmacy for the frontend details page
    return {
      ...branch,
      name: `${branch.pharmacy.name} - ${branch.name}`,
      status: branch.branchStatus,
      user: branch.pharmacy.user,
    };
  }

  // ========================================
  // FIND PHARMACY BY USER ID
  // ========================================

  async findByUserId(userId: string) {
    const pharmacy = await this.prisma.pharmacy.findUnique({
      where: { userId },
      include: {
        // Include the owning user so callers (e.g. getProfile) can access email.
        // Email lives on User, not Pharmacy — without this join it is always undefined.
        user: { select: { email: true } },
      },
    });

    if (!pharmacy) {
      throw new NotFoundException('Pharmacy not found');
    }

    // Flatten email onto the pharmacy object so every consumer can read
    // `pharmacy.email` without knowing about the nested user relation.
    return {
      ...pharmacy,
      email: pharmacy.user?.email ?? null,
    };
  }

  // ========================================
  // UPDATE PHARMACY (Internal method)
  // ========================================

  async update(id: string, dto: UpdatePharmacyDto) {
    return this.prisma.pharmacy.update({
      where: { id },
      data: {
        ...dto,
        dateOfIncorporation: dto.dateOfIncorporation
          ? new Date(dto.dateOfIncorporation)
          : undefined,
      },
    });
  }

  // ========================================
  // GET PHARMACY PROFILE
  // ========================================

  async getProfile(userId: string) {
    return this.findByUserId(userId);
  }

  // ========================================
  // UPDATE PHARMACY PROFILE (WITH APPROVAL WORKFLOW)
  // ========================================

  async updateProfile(userId: string, dto: UpdatePharmacyDto) {
    const pharmacy = await this.prisma.pharmacy.findUnique({
      where: { userId },
      include: { user: true },
    });

    if (!pharmacy) {
      throw new NotFoundException('Pharmacy not found');
    }

    // Only approved pharmacies can update profile
    if (pharmacy.status !== 'APPROVED') {
      throw new ForbiddenException(
        'Only approved pharmacies can update their profile',
      );
    }

    // Critical fields that require admin re-approval
    const criticalFields = [
      'name',
      'representativeName',
      'rdbCertificate',
      'pharmacyLicense',
      'dateOfIncorporation',
    ];

    const hasCriticalChanges = criticalFields.some(
      (field) => dto[field] !== undefined,
    );

    if (hasCriticalChanges) {
      const updatedPharmacy = await this.prisma.pharmacy.update({
        where: { id: pharmacy.id },
        data: {
          ...dto,
          dateOfIncorporation: dto.dateOfIncorporation
            ? new Date(dto.dateOfIncorporation)
            : undefined,
          status: 'PENDING',
          rejectionReason: null,
        },
      });

      await this.notifySuperAdminsPharmacyUpdate(pharmacy.id, pharmacy.name);

      return {
        message:
          'Profile update submitted for admin approval. Critical changes require verification.',
        pharmacy: updatedPharmacy,
        requiresApproval: true,
      };
    } else {
      const updatedPharmacy = await this.prisma.pharmacy.update({
        where: { id: pharmacy.id },
        data: {
          ...dto,
          dateOfIncorporation: dto.dateOfIncorporation
            ? new Date(dto.dateOfIncorporation)
            : undefined,
        },
      });

      return {
        message: 'Profile updated successfully',
        pharmacy: updatedPharmacy,
        requiresApproval: false,
      };
    }
  }

  // ========================================
  // RESUBMIT APPLICATION (FOR REJECTED PHARMACIES)
  // ========================================

  async resubmitApplication(userId: string, dto: UpdatePharmacyDto) {
    const pharmacy = await this.prisma.pharmacy.findUnique({
      where: { userId },
      include: { user: true },
    });

    if (!pharmacy) {
      throw new NotFoundException('Pharmacy not found');
    }

    if (pharmacy.status !== 'REJECTED') {
      throw new ForbiddenException(
        'Only rejected pharmacies can resubmit their application',
      );
    }

    const updatedPharmacy = await this.prisma.pharmacy.update({
      where: { id: pharmacy.id },
      data: {
        ...dto,
        dateOfIncorporation: dto.dateOfIncorporation
          ? new Date(dto.dateOfIncorporation)
          : undefined,
        status: 'PENDING',
        rejectionReason: null,
        approvedAt: null,
      },
    });

    await this.notifySuperAdminsPharmacyResubmission(
      pharmacy.id,
      pharmacy.name,
    );

    return {
      message:
        'Application resubmitted successfully. Your pharmacy will be reviewed by our admin team.',
      pharmacy: updatedPharmacy,
    };
  }

  // ========================================
  // GET APPROVED PHARMACIES (Public)
  // ========================================

  async getApprovedPharmacies() {
    return this.prisma.pharmacy.findMany({
      where: { status: 'APPROVED' },
      include: {
        _count: {
          select: { medications: true },
        },
      },
      orderBy: { name: 'asc' },
    });
  }

  // ========================================
  // ADMIN: APPROVE PHARMACY OR PROFILE UPDATE
  // ========================================

  async approvePharmacy(
    pharmacyId: string,
    approved: boolean,
    rejectionReason?: string,
  ) {
    const pharmacy = await this.prisma.pharmacy.findUnique({
      where: { id: pharmacyId },
      include: { user: true },
    });

    if (!pharmacy) {
      throw new NotFoundException('Pharmacy not found');
    }

    const updatedPharmacy = await this.prisma.pharmacy.update({
      where: { id: pharmacyId },
      data: {
        status: approved ? 'APPROVED' : 'REJECTED',
        rejectionReason: approved ? null : rejectionReason,
        approvedAt: approved ? new Date() : null,
      },
    });

    await this.emailService.sendPharmacyApproval(
      pharmacy.user.email,
      pharmacy.name,
      approved,
      rejectionReason,
    );

    await this.prisma.notification.create({
      data: {
        pharmacyId: pharmacy.id,
        type: approved ? 'PHARMACY_APPROVED' : 'PHARMACY_REJECTED',
        title: approved ? 'Application Approved' : 'Application Rejected',
        message: approved
          ? 'Your pharmacy has been approved! You can now access your dashboard.'
          : `Your pharmacy application was rejected. Reason: ${rejectionReason}. Please update your documents and resubmit.`,
      },
    });

    return {
      message: approved
        ? 'Pharmacy approved successfully'
        : 'Pharmacy rejected',
      pharmacy: updatedPharmacy,
    };
  }

  // ========================================
  // ADMIN: GET ALL PENDING PHARMACIES
  // ========================================

  async getPendingPharmacies() {
    return this.prisma.pharmacy.findMany({
      where: { status: 'PENDING' },
      include: {
        user: {
          select: {
            email: true,
            isVerified: true,
            createdAt: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ========================================
  // ADMIN: GET ALL PHARMACIES
  // ========================================

  async getAllPharmacies(status?: string) {
    const where = status ? { status: status as any } : {};

    return this.prisma.pharmacy.findMany({
      where,
      include: {
        user: {
          select: {
            email: true,
            isVerified: true,
            createdAt: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ========================================
  // HELPER METHODS
  // ========================================

  private async notifySuperAdminsPharmacyUpdate(
    pharmacyId: string,
    pharmacyName: string,
  ) {
    const superAdmins = await this.prisma.user.findMany({
      where: { role: 'SUPER_ADMIN' },
    });

    for (const admin of superAdmins) {
      await this.prisma.notification.create({
        data: {
          type: 'PHARMACY_APPROVED',
          title: 'Pharmacy Profile Update',
          message: `${pharmacyName} has submitted profile updates for review.`,
        },
      });
    }
  }

  private async notifySuperAdminsPharmacyResubmission(
    pharmacyId: string,
    pharmacyName: string,
  ) {
    const superAdmins = await this.prisma.user.findMany({
      where: { role: 'SUPER_ADMIN' },
    });

    for (const admin of superAdmins) {
      await this.prisma.notification.create({
        data: {
          type: 'PHARMACY_APPROVED',
          title: 'Pharmacy Application Resubmitted',
          message: `${pharmacyName} has resubmitted their application with updated documents for review.`,
        },
      });
    }
  }

  calculateDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number,
  ): number {
    const R = 6371;
    const dLat = this.deg2rad(lat2 - lat1);
    const dLon = this.deg2rad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.deg2rad(lat1)) *
        Math.cos(this.deg2rad(lat2)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private deg2rad(deg: number): number {
    return deg * (Math.PI / 180);
  }

  getDeliveryFee(pharmacyId: string, distance: number): number {
    const defaultZones = [
      { name: 'Zone 1', maxDistance: 5, fee: 1000 },
      { name: 'Zone 2', maxDistance: 10, fee: 2000 },
      { name: 'Zone 3', maxDistance: 15, fee: 3000 },
      { name: 'Zone 4', maxDistance: 999, fee: 5000 },
    ];

    for (const zone of defaultZones) {
      if (distance <= zone.maxDistance) {
        return zone.fee;
      }
    }

    return 5000;
  }

  //-----------------------------------
  //ADMIN: GET ALL PHARMACY LOCATIONS
  //-----------------------------------

  async getPharmacyLocations() {
    const dayOfWeek = new Date()
      .toLocaleString('en-US', { timeZone: 'Africa/Kigali', weekday: 'long' })
      .toLowerCase();

    const [pharmacies, branches] = await Promise.all([
      this.prisma.pharmacy.findMany({
        where: { status: 'APPROVED' },
        include: { user: { select: { isActive: true } } },
      }),
      this.prisma.branch.findMany({
        where: { branchStatus: 'APPROVED' },
        include: {
          pharmacy: { include: { user: { select: { isActive: true } } } },
        },
      }),
    ]);

    const all = [
      ...pharmacies.map((p) => {
        const todayHours = p.operatingHours
          ? (p.operatingHours as any)[dayOfWeek]
          : null;
        const hoursString =
          todayHours && todayHours.open && todayHours.close
            ? `${todayHours.open}-${todayHours.close}`
            : null;
        return toPharmacyLocationDto({
          ...p,
          isActive: p.user?.isActive ?? true,
          hours: hoursString,
          region: null, // Resolved by mapper
          rating: null,
        });
      }),
      ...branches.map((b) => {
        const todayHours = b.operatingHours
          ? (b.operatingHours as any)[dayOfWeek]
          : null;
        const hoursString =
          todayHours && todayHours.open && todayHours.close
            ? `${todayHours.open}-${todayHours.close}`
            : null;
        return toPharmacyLocationDto({
          ...b,
          name: `${b.pharmacy.name} - ${b.name}`,
          isActive: b.pharmacy.user?.isActive ?? true,
          hours: hoursString,
          region: null, // Resolved by mapper
          rating: null,
        });
      }),
    ];

    return all;
  }
  // ========================================
  // ADMIN&PATIENT: GET PHARMACY DETAILS (FOR MAP VIEW)
  // ========================================
  async getPharmacyDetails(id: string) {
    const dayOfWeek = new Date()
      .toLocaleString('en-US', { timeZone: 'Africa/Kigali', weekday: 'long' })
      .toLowerCase();

    // Check main pharmacy
    const pharmacy = await this.prisma.pharmacy.findUnique({
      where: { id },
      include: {
        user: { select: { isActive: true } },
        medications: true,
      },
    });

    if (pharmacy) {
      const todayHours = pharmacy.operatingHours
        ? (pharmacy.operatingHours as any)[dayOfWeek]
        : null;
      const hoursString =
        todayHours && todayHours.open && todayHours.close
          ? `${todayHours.open}-${todayHours.close}`
          : null;

      return toPharmacyLocationDto({
        ...pharmacy,
        isActive: pharmacy.user?.isActive ?? true,
        hours: hoursString,
        region: null, // Mapper will resolve via coordinates
        rating: null,
      });
    }

    // Check branch
    const branch = await this.prisma.branch.findUnique({
      where: { id },
      include: {
        pharmacy: {
          include: {
            user: { select: { isActive: true } },
          },
        },
        medications: true,
      },
    });

    if (branch) {
      const todayHours = branch.operatingHours
        ? (branch.operatingHours as any)[dayOfWeek]
        : null;
      const hoursString =
        todayHours && todayHours.open && todayHours.close
          ? `${todayHours.open}-${todayHours.close}`
          : null;

      return toPharmacyLocationDto({
        ...branch,
        name: `${branch.pharmacy.name} - ${branch.name}`,
        isActive: branch.pharmacy.user?.isActive ?? true,
        hours: hoursString,
        region: null, // Mapper will resolve via coordinates
        rating: null,
      });
    }

    throw new NotFoundException('Pharmacy or Branch not found');
  }
}
