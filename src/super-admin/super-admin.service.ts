// backend/src/super-admin/super-admin.service.ts
// FIXED VERSION - Added getAllPatients and document preview methods

import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { EmailService } from '../notifications/email.service';
import { ApprovePharmacyDto, RejectPharmacyDto, VerifyLocationDto } from './dto';

@Injectable()
export class SuperAdminService {
  constructor(
    private prisma: PrismaService,
    private notificationsService: NotificationsService,
    private emailService: EmailService,
  ) { }

  // ========================================
  // GET PLATFORM ANALYTICS
  // ========================================

  async getPlatformAnalytics() {
    const [
      totalPatients,
      totalPharmacies,
      approvedPharmacies,
      pendingPharmacies,
      totalOrders,
      completedOrders,
      totalRevenue,
    ] = await Promise.all([
      this.prisma.patient.count(),
      this.prisma.pharmacy.count(),
      this.prisma.pharmacy.count({ where: { status: 'APPROVED' } }),
      this.prisma.pharmacy.count({ where: { status: 'PENDING' } }),
      this.prisma.order.count(),
      this.prisma.order.count({ where: { status: 'COMPLETED' } }),
      this.prisma.payment.aggregate({
        where: { status: 'COMPLETED' },
        _sum: { amount: true },
      }),
    ]);

    // Calculate platform revenue (monthly fees from pharmacies)
    const platformFee = 50; // $50 per pharmacy per month
    const platformRevenue = approvedPharmacies * platformFee;

    return {
      totalPatients,
      totalPharmacies,
      approvedPharmacies,
      pendingPharmacies,
      totalOrders,
      completedOrders,
      totalRevenue: totalRevenue._sum.amount || 0,
      platformRevenue,
      platformFeePerPharmacy: platformFee,
    };
  }

  // ========================================
  // GET PENDING PHARMACIES
  // ========================================

  async getPendingPharmacies() {
    return this.prisma.pharmacy.findMany({
      where: { status: 'PENDING' },
      include: {
        user: {
          select: { email: true, createdAt: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ========================================
  // GET ALL PHARMACIES (with filters)
  // ========================================

  async getAllPharmacies(status?: string) {
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
  // GET PHARMACY BY ID (with full documents)
  // ========================================

  async getPharmacyById(id: string) {
    const pharmacy = await this.prisma.pharmacy.findUnique({
      where: { id },
      include: {
        user: {
          select: { email: true },
        },
        medications: {
          select: {
            id: true,
            name: true,
            quantity: true,
            price: true,
          },
        },
        orders: {
          take: 10,
          orderBy: { createdAt: 'desc' },
          include: {
            patient: {
              select: { firstName: true, lastName: true },
            },
          },
        },
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
  // GET PHARMACY DOCUMENT (NEW)
  // ========================================

  async getPharmacyDocument(pharmacyId: string, documentType: 'rdb' | 'license') {
    const pharmacy = await this.prisma.pharmacy.findUnique({
      where: { id: pharmacyId },
      select: {
        rdbCertificate: true,
        pharmacyLicense: true,
        name: true,
      },
    });

    if (!pharmacy) {
      throw new NotFoundException('Pharmacy not found');
    }

    const documentUrl = documentType === 'rdb'
      ? pharmacy.rdbCertificate
      : pharmacy.pharmacyLicense;

    if (!documentUrl) {
      throw new NotFoundException(`${documentType === 'rdb' ? 'RDB Certificate' : 'Pharmacy License'} not found`);
    }

    return {
      pharmacyName: pharmacy.name,
      documentType: documentType === 'rdb' ? 'RDB Certificate' : 'Pharmacy License',
      documentUrl,
    };
  }

  // ========================================
  // APPROVE PHARMACY
  // ========================================

  async approvePharmacy(id: string, dto: ApprovePharmacyDto) {
    const pharmacy = await this.prisma.pharmacy.findUnique({
      where: { id },
      include: {
        user: true,
      },
    });

    if (!pharmacy) {
      throw new NotFoundException('Pharmacy not found');
    }

    // Update pharmacy status
    const updated = await this.prisma.pharmacy.update({
      where: { id },
      data: {
        status: 'APPROVED',
        approvedAt: new Date(),
        rejectionReason: null, // Clear any previous rejection reason
      },
    });

    // Send approval email
    try {
      await this.emailService.sendPharmacyApproval(
        pharmacy.user.email,
        pharmacy.name,
        true,
      );
    } catch (error) {
      console.error('Failed to send approval email:', error);
    }

    // Create notification
    try {
      await this.notificationsService.create({
        pharmacyId: pharmacy.id,
        type: 'PHARMACY_APPROVED',
        title: 'Pharmacy Approved',
        message: `Congratulations! Your pharmacy "${pharmacy.name}" has been approved and is now live on E-Vuze.`,
      });
    } catch (error) {
      console.error('Failed to create notification:', error);
    }

    return updated;
  }

  // ========================================
  // REJECT PHARMACY
  // ========================================

  async rejectPharmacy(id: string, dto: RejectPharmacyDto) {
    const pharmacy = await this.prisma.pharmacy.findUnique({
      where: { id },
      include: {
        user: true,
      },
    });

    if (!pharmacy) {
      throw new NotFoundException('Pharmacy not found');
    }

    // Update pharmacy status
    const updated = await this.prisma.pharmacy.update({
      where: { id },
      data: {
        status: 'REJECTED',
        rejectionReason: dto.reason,
        approvedAt: null,
      },
    });

    // Send rejection email
    try {
      await this.emailService.sendPharmacyApproval(
        pharmacy.user.email,
        pharmacy.name,
        false,
        dto.reason,
      );
    } catch (error) {
      console.error('Failed to send rejection email:', error);
    }

    // Create notification
    try {
      await this.notificationsService.create({
        pharmacyId: pharmacy.id,
        type: 'PHARMACY_REJECTED',
        title: 'Pharmacy Application Update',
        message: `Your pharmacy application requires attention. Reason: ${dto.reason}. Please update your documents and resubmit.`,
      });
    } catch (error) {
      console.error('Failed to create notification:', error);
    }

    return updated;
  }

  // ========================================
  // GET ALL PATIENTS - ADDED
  // ========================================

  async getAllPatients() {
    return this.prisma.patient.findMany({
      include: {
        user: {
          select: {
            email: true,
            isVerified: true,
            createdAt: true,
          },
        },
        _count: {
          select: { orders: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ========================================
  // GET RECENT ORDERS (Platform-wide)
  // ========================================

  async getRecentOrders(limit: number = 20) {
    return this.prisma.order.findMany({
      take: limit,
      include: {
        patient: {
          select: { firstName: true, lastName: true },
        },
        pharmacy: {
          select: { name: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ========================================
  // GET REVENUE ANALYTICS
  // ========================================

  async getRevenueAnalytics(startDate?: Date, endDate?: Date) {
    const where: any = {
      status: 'COMPLETED',
    };

    if (startDate && endDate) {
      where.createdAt = {
        gte: startDate,
        lte: endDate,
      };
    }

    const payments = await this.prisma.payment.findMany({
      where,
      select: {
        amount: true,
        createdAt: true,
        order: {
          select: {
            pharmacy: {
              select: { name: true },
            },
          },
        },
      },
    });

    // Group by date
    const revenueByDate = payments.reduce((acc: any, payment) => {
      const date = payment.createdAt.toISOString().split('T')[0];
      if (!acc[date]) {
        acc[date] = 0;
      }
      acc[date] += payment.amount;
      return acc;
    }, {});

    return {
      totalRevenue: payments.reduce((sum, p) => sum + p.amount, 0),
      transactionCount: payments.length,
      revenueByDate,
    };
  }

  // ========================================
  // GET PHARMACIES WITH UNVERIFIED LOCATIONS
  // ========================================

  async getUnverifiedLocations() {
    return this.prisma.pharmacy.findMany({
      where: {
        latitude: { not: null },
        longitude: { not: null },
        isLocationVerified: false,
      },
      include: {
        user: { select: { email: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ========================================
  // VERIFY PHARMACY LOCATION
  // ========================================

  async verifyPharmacyLocation(id: string, dto: VerifyLocationDto) {
    const pharmacy = await this.prisma.pharmacy.findUnique({ where: { id } });
    if (!pharmacy) throw new NotFoundException('Pharmacy not found');

    return this.prisma.pharmacy.update({
      where: { id },
      data: {
        isLocationVerified: dto.verified,
        locationVerifiedAt: dto.verified ? new Date() : null,
      },
    });
  }

  async getPendingBranches() {
    return this.prisma.branch.findMany({
      where: { branchStatus: 'PENDING' },
      select: {
        id: true,
        name: true,
        address: true,
        phone: true,
        branchManagerEmail: true,
        pharmacyLicense: true,
        createdAt: true,
        pharmacy: { select: { id: true, name: true, representativeName: true } },
        manager: { select: { email: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async approveBranch(branchId: string) {
    const branch = await this.prisma.branch.findUnique({
      where: { id: branchId },
      include: { pharmacy: { include: { user: true } }, manager: true },
    });
    if (!branch) throw new NotFoundException('Branch not found');

    const updated = await this.prisma.branch.update({
      where: { id: branchId },
      data: { branchStatus: 'APPROVED', isActive: true },
    });

    if (branch.manager?.email) {
      await this.emailService.sendBranchApproval(branch.manager.email, branch.name, true);
    }
    if (branch.pharmacy.user?.email) {
      await this.emailService.sendBranchApproval(branch.pharmacy.user.email, branch.name, true);
    }

    return updated;
  }

  async rejectBranch(branchId: string, reason: string) {
    const branch = await this.prisma.branch.findUnique({
      where: { id: branchId },
      include: { pharmacy: { include: { user: true } }, manager: true },
    });
    if (!branch) throw new NotFoundException('Branch not found');

    const updated = await this.prisma.branch.update({
      where: { id: branchId },
      data: { branchStatus: 'REJECTED', isActive: false },
    });

    if (branch.manager?.email) {
      await this.emailService.sendBranchApproval(branch.manager.email, branch.name, false, reason);
    }
    if (branch.pharmacy.user?.email) {
      await this.emailService.sendBranchApproval(branch.pharmacy.user.email, branch.name, false, reason);
    }

    return updated;
  }
}