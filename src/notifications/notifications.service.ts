// backend/src/notifications/notifications.service.ts

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from './email.service';
import { NotificationType } from '@prisma/client';

interface CreateNotificationDto {
  patientId?: string;
  pharmacyId?: string;
  orderId?: string;
  type: NotificationType;
  title: string;
  message: string;
}

@Injectable()
export class NotificationsService {
  constructor(
    private prisma: PrismaService,
    private emailService: EmailService,
  ) {}

  // ========================================
  // CREATE NOTIFICATION
  // ========================================

  async create(dto: CreateNotificationDto) {
    return this.prisma.notification.create({
      data: dto,
    });
  }

  // ========================================
  // GET USER NOTIFICATIONS
  // ========================================

  async findByUser(userId: string, userType: 'patient' | 'pharmacy') {
    const where =
      userType === 'patient'
        ? { patient: { userId } }
        : { pharmacy: { userId } };

    return this.prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  // ========================================
  // MARK AS READ
  // ========================================

  async markAsRead(id: string) {
    return this.prisma.notification.update({
      where: { id },
      data: { isRead: true },
    });
  }

  // ========================================
  // MARK ALL AS READ
  // ========================================

  async markAllAsRead(userId: string, userType: 'patient' | 'pharmacy') {
    const where =
      userType === 'patient'
        ? { patient: { userId } }
        : { pharmacy: { userId } };

    return this.prisma.notification.updateMany({
      where,
      data: { isRead: true },
    });
  }

  // ========================================
  // SEND EMAIL NOTIFICATIONS
  // ========================================

  async sendVerificationEmail(email: string, code: string) {
    await this.emailService.sendVerificationEmail(email, code);
  }

  async sendPasswordResetEmail(email: string, resetCode: string) {
    await this.emailService.sendPasswordResetEmail(email, resetCode);
  }

  async sendOrderStatusEmail(data: {
    email: string;
    name: string;
    orderNumber: string;
    status: string;
    message: string;
  }) {
    await this.emailService.sendOrderNotification(data);
  }

  async notifySuperAdminsNewPharmacy(pharmacyId: string, pharmacyName: string) {
    // Get all super admins
    const superAdmins = await this.prisma.user.findMany({
      where: { role: 'SUPER_ADMIN' },
    });

    const title = 'New Pharmacy Application';
    const message = `${pharmacyName} has registered and is pending approval.`;

    // Create in-app notifications for each super admin
    for (const admin of superAdmins) {
      await this.create({
        type: 'PHARMACY_APPROVED', // Reuse enum
        title,
        message,
      });
    }

    // Send email alert to the configured SUPER_ADMIN_EMAIL
    // Since the email config sends to the centralized info@ubwengelab.rw or similar, we just call it once
    await this.emailService.sendSuperAdminAlert(
      title,
      message,
      'Review Pharmacy',
      `${process.env.FRONTEND_URL || 'http://localhost:3000'}/super-admin/pharmacies`
    );
  }

  async notifySuperAdminsNewBranch(branchName: string, pharmacyName: string) {
    // Get all super admins
    const superAdmins = await this.prisma.user.findMany({
      where: { role: 'SUPER_ADMIN' },
    });

    const title = 'New Branch Registration';
    const message = `A new branch "${branchName}" has been registered by "${pharmacyName}" and its coordinates are pending verification.`;

    // Create in-app notifications for each super admin
    for (const admin of superAdmins) {
      await this.create({
        type: 'PHARMACY_APPROVED', // Fallback to an existing enum or add a new one in Prisma schema later if needed
        title,
        message,
      });
    }

    // Send email alert
    await this.emailService.sendSuperAdminAlert(
      title,
      message,
      'Verify Location',
      `${process.env.FRONTEND_URL || 'http://localhost:3000'}/super-admin/branches`
    );
  }
}
