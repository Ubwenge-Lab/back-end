// backend/src/super-admin/super-admin.service.ts
// FIXED VERSION - Added getAllPatients method

import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { EmailService } from '../notifications/email.service';
import { ApprovePharmacyDto, RejectPharmacyDto } from './dto';

@Injectable()
export class SuperAdminService {
  constructor(
    private prisma: PrismaService,
    private notificationsService: NotificationsService,
    private emailService: EmailService,
  ) {}

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
  // GET PHARMACY BY ID
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
        message: `Your pharmacy application requires attention. Reason: ${dto.reason}`,
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
}