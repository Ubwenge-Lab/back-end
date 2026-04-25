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

    // Revenue overtime (last 6 months)
    const revenueOverTime = await Promise.all(
      Array.from({ length: 6 }, (_, i) => {
        const date = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
        const start = new Date(date.getFullYear(), date.getMonth(), 1);
        const end = new Date(
          date.getFullYear(),
          date.getMonth() + 1,
          0,
          23,
          59,
          59,
          999,
        );
        return this.prisma.order
          .aggregate({
            where: {
              pharmacyId: pharmacy.id,
              status: 'COMPLETED',
              createdAt: { gte: start, lte: end },
            },
            _sum: { total: true },
          })
          .then((result) => ({
            month: date.toLocaleString('default', { month: 'short' }),
            revenue: result._sum.total ?? 0,
          }));
      }),
    );

    // Revenue by branch
    const branches = await this.prisma.branch.findMany({
      where: { pharmacyId: pharmacy.id },
      select: { id: true, name: true },
    });

    const revenueByBranch = await Promise.all(
      branches.map(async (branch) => {
        const result = await this.prisma.order.aggregate({
          where: {
            branchId: branch.id,
            status: 'COMPLETED',
            createdAt: { gte: startOfMonth, lte: endOfMonth },
          },
          _sum: { total: true },
        });
        return { name: branch.name, revenue: result._sum.total ?? 0 };
      }),
    );

    // medication count per branch
    const inventoryDistribution = await Promise.all(
      branches.map(async (branch) => {
        const value = await this.prisma.medication.count({
          where: { branchId: branch.id },
        });
        return { name: branch.name, value };
      }),
    );

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

    // group low stock meds by branch
    const lowStockByBranch = lowStockMeds.reduce(
      (acc, med) => {
        const branchName = med.branch.name;
        if (!acc[branchName]) acc[branchName] = [];
        acc[branchName].push({ name: med.name, quantity: med.quantity });
        return acc;
      },
      {} as Record<string, { name: string; quantity: number }[]>,
    );

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

    // Fetch all branches for this pharmacy
    const branches = await this.prisma.branch.findMany({
      where: { pharmacyId: pharmacy.id },
      select: { id: true, name: true },
    });

    // Build a day-by-day array for the last 30 days
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

    // For each day fetch total revenue across all branches (pharmacy-wide)
    const dailyTotal = await Promise.all(
      days.map(async ({ date, label }) => {
        const start = new Date(date + 'T00:00:00.000Z');
        const end = new Date(date + 'T23:59:59.999Z');
        const result = await this.prisma.order.aggregate({
          where: {
            pharmacyId: pharmacy.id,
            status: 'COMPLETED',
            createdAt: { gte: start, lte: end },
          },
          _sum: { total: true },
        });
        return { date, label, revenue: result._sum.total ?? 0 };
      }),
    );

    // Per-branch daily breakdown
    const branchDaily = await Promise.all(
      branches.map(async (branch) => {
        const data = await Promise.all(
          days.map(async ({ date, label }) => {
            const start = new Date(date + 'T00:00:00.000Z');
            const end = new Date(date + 'T23:59:59.999Z');
            const result = await this.prisma.order.aggregate({
              where: {
                branchId: branch.id,
                status: 'COMPLETED',
                createdAt: { gte: start, lte: end },
              },
              _sum: { total: true },
            });
            return { date, label, revenue: result._sum.total ?? 0 };
          }),
        );
        return { branchId: branch.id, branchName: branch.name, data };
      }),
    );

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

    // Fetch all branches
    const branches = await this.prisma.branch.findMany({
      where: { pharmacyId: pharmacy.id },
      select: { id: true, name: true },
    });

    // Pharmacy-wide weekly totals
    const weeklyTotal = await Promise.all(
      weeks.map(async ({ label, start, end }) => {
        const result = await this.prisma.order.aggregate({
          where: {
            pharmacyId: pharmacy.id,
            status: 'COMPLETED',
            createdAt: { gte: start, lte: end },
          },
          _sum: { total: true },
        });
        return { label, revenue: result._sum.total ?? 0 };
      }),
    );

    // Per-branch weekly breakdown
    const branchWeekly = await Promise.all(
      branches.map(async (branch) => {
        const data = await Promise.all(
          weeks.map(async ({ label, start, end }) => {
            const result = await this.prisma.order.aggregate({
              where: {
                branchId: branch.id,
                status: 'COMPLETED',
                createdAt: { gte: start, lte: end },
              },
              _sum: { total: true },
            });
            return { label, revenue: result._sum.total ?? 0 };
          }),
        );
        return { branchId: branch.id, branchName: branch.name, data };
      }),
    );

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
    const lastMonth = new Date(
      now.getFullYear(),
      now.getMonth() - 1,
      now.getDate(),
    );
    const twoMonthsAgo = new Date(
      now.getFullYear(),
      now.getMonth() - 2,
      now.getDate(),
    );

    // Fetch all orders
    const allOrders = await this.prisma.order.findMany({
      where: {
        pharmacyId: pharmacy.id,
        createdAt: { gte: twoMonthsAgo },
      },
      include: {
        orderItems: true,
      },
    });

    // Current month orders
    const thisMonthOrders = allOrders.filter(
      (o) => new Date(o.createdAt) >= lastMonth,
    );
    const previousMonthOrders = allOrders.filter(
      (o) =>
        new Date(o.createdAt) >= twoMonthsAgo &&
        new Date(o.createdAt) < lastMonth,
    );

    // Calculate revenue
    const totalRevenue = thisMonthOrders.reduce((sum, o) => sum + o.total, 0);
    const prevRevenue = previousMonthOrders.reduce(
      (sum, o) => sum + o.total,
      0,
    );
    const revenueChange =
      prevRevenue > 0
        ? Math.round(((totalRevenue - prevRevenue) / prevRevenue) * 100)
        : 0;

    // Calculate orders
    const totalOrders = thisMonthOrders.length;
    const prevOrders = previousMonthOrders.length;
    const ordersChange =
      prevOrders > 0
        ? Math.round(((totalOrders - prevOrders) / prevOrders) * 100)
        : 0;

    // Calculate average order value
    const avgOrderValue =
      totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0;
    const prevAvgOrderValue =
      prevOrders > 0 ? Math.round(prevRevenue / prevOrders) : 0;
    const avgValueChange =
      prevAvgOrderValue > 0
        ? Math.round(
            ((avgOrderValue - prevAvgOrderValue) / prevAvgOrderValue) * 100,
          )
        : 0;

    // Calculate items sold
    const itemsSold = thisMonthOrders.reduce(
      (sum, o) => sum + o.orderItems.reduce((s, i) => s + i.quantity, 0),
      0,
    );
    const prevItemsSold = previousMonthOrders.reduce(
      (sum, o) => sum + o.orderItems.reduce((s, i) => s + i.quantity, 0),
      0,
    );
    const itemsChange =
      prevItemsSold > 0
        ? Math.round(((itemsSold - prevItemsSold) / prevItemsSold) * 100)
        : 0;

    return {
      totalRevenue,
      totalOrders,
      avgOrderValue,
      itemsSold,
      revenueChange,
      ordersChange,
      avgValueChange,
      itemsChange,
    };
  }

  // ========================================
  // VIEW ALL PAST PATIENTS
  // ========================================

  async getPatients(userId: string) {
    const pharmacy = await this.findByUserId(userId);

    // Get all unique patients who have ordered from this pharmacy
    const orders = await this.prisma.order.findMany({
      where: { pharmacyId: pharmacy.id },
      include: {
        patient: {
          include: {
            user: {
              select: { email: true },
            },
          },
        },
        orderItems: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    // Group by patient
    const patientMap = new Map();

    for (const order of orders) {
      const patientId = order.patientId;

      if (!patientMap.has(patientId)) {
        patientMap.set(patientId, {
          id: order.patient.id,
          firstName: order.patient.firstName,
          lastName: order.patient.lastName,
          email: order.patient.user.email,
          phone: order.patient.phone,
          totalOrders: 0,
          totalSpent: 0,
          lastOrderDate: order.createdAt,
          orders: [],
        });
      }

      const patientData = patientMap.get(patientId);
      patientData.totalOrders++;
      patientData.totalSpent += order.total;
      patientData.orders.push({
        id: order.id,
        orderNumber: order.orderNumber,
        status: order.status,
        total: order.total,
        createdAt: order.createdAt,
        itemCount: order.orderItems.length,
      });
    }

    // Convert map to array and sort by last order date
    const patients = Array.from(patientMap.values()).sort(
      (a, b) =>
        new Date(b.lastOrderDate).getTime() -
        new Date(a.lastOrderDate).getTime(),
    );

    return {
      totalPatients: patients.length,
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
        _count: {
          select: { medications: true, orders: true },
        },
      },
    });

    if (!pharmacy) {
      throw new NotFoundException('Pharmacy not found');
    }

    return pharmacy;
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
    const pharmacies = await this.prisma.pharmacy.findMany({
      select: {
        id: true,
        name: true,
        address: true,
        phone: true,
        latitude: true,
        longitude: true,
        status: true,
        operatingHours: true,
      },
      orderBy: { name: 'asc' },
    });

    const dayOfWeek = new Date().toLocaleString("en-US", { timeZone: "Africa/Kigali", weekday: 'long' }).toLowerCase();

    const mapped = pharmacies.map((pharmacy) => {
      const todayHours = pharmacy.operatingHours ? (pharmacy.operatingHours as any)[dayOfWeek] : null;
      const hoursString = todayHours && todayHours.open && todayHours.close ? `${todayHours.open}-${todayHours.close}` : null;

      return toPharmacyLocationDto({
        ...pharmacy,
        hours: hoursString,
        region: pharmacy.latitude && pharmacy.longitude ? getDistrict(pharmacy.latitude, pharmacy.longitude, pharmacy.address) : 'Unknown',
        rating: null,
        isActive: pharmacy.status === 'APPROVED',
      });
    });

    return {
      pharmacies: mapped,
      total: mapped.length,
    };
  }
}
