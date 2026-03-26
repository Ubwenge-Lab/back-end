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
    const where = userType === 'patient' 
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
    const where = userType === 'patient'
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

  async sendVerificationEmail(email: string, code: string,) {
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

    // Create in-app notifications for each super admin
    for (const admin of superAdmins) {
      await this.create({
        type: 'PHARMACY_APPROVED', // Reuse enum
        title: 'New Pharmacy Application',
        message: `${pharmacyName} has registered and is pending approval.`,
      });
    }
  }
}