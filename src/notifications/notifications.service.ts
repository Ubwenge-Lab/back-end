import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsGateway } from './notifications.gateway';
import { EmailService } from './email.service';

@Injectable()
export class NotificationsService {
  constructor(
    private prisma: PrismaService,
    private gateway: NotificationsGateway,
    private emailService: EmailService,
  ) {}

  async create(data: any) {
    const notification = await this.prisma.notification.create({
      data: {
        userId: data.userId,
        type: data.type,
        title: data.title,
        message: data.message,
      },
    });

    // Emit real-time notification via WebSocket
    if (data.userId) {
      this.gateway.sendNotificationToUser(data.userId, notification);
    }

    return notification;
  }

  async findByUser(userId: string, userType?: string) {
    return this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findAll(userId: string) {
    return this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async markAsRead(id: string) {
    return this.prisma.notification.update({
      where: { id },
      data: { isRead: true },
    });
  }

  async markAllAsRead(userId: string, userType?: string) {
    return this.prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });
  }

  async sendVerificationEmail(email: string, code: string) {
    await this.emailService.sendVerificationEmail(email, code);
  }

  async sendPasswordResetEmail(email: string, code: string) {
    await this.emailService.sendPasswordResetEmail(email, code);
  }

  async sendOrderNotification(data: {
    email: string;
    customerName: string;
    orderNumber: string;
    status: string;
    message: string;
  }) {
    await this.emailService.sendOrderNotification({
      email: data.email,
      name: data.customerName,
      orderNumber: data.orderNumber,
      status: data.status,
      message: data.message,
    });
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
    const superAdmins = await this.prisma.user.findMany({
      where: { role: 'SUPER_ADMIN' },
    });

    const title = 'New Pharmacy Application';
    const message = `${pharmacyName} has registered and is pending approval.`;

    for (const admin of superAdmins) {
      await this.create({
        userId: admin.id,
        type: 'PHARMACY_APPROVED',
        title,
        message,
      });
    }

    await this.emailService.sendSuperAdminAlert(
      title,
      message,
      'Review Pharmacy',
      `${process.env.FRONTEND_URL || 'http://localhost:3000'}/super-admin/pharmacies`,
    );
  }

  async notifySuperAdminsNewBranch(branchName: string, pharmacyName: string) {
    const superAdmins = await this.prisma.user.findMany({
      where: { role: 'SUPER_ADMIN' },
    });

    const title = 'New Branch Registration';
    const message = `A new branch "${branchName}" has been registered by "${pharmacyName}" and its coordinates are pending verification.`;

    for (const admin of superAdmins) {
      await this.create({
        userId: admin.id,
        type: 'PHARMACY_APPROVED',
        title,
        message,
      });
    }

    await this.emailService.sendSuperAdminAlert(
      title,
      message,
      'Verify Location',
      `${process.env.FRONTEND_URL || 'http://localhost:3000'}/super-admin/branches`,
    );
  }

  async sendStaffCredentials(
    email: string,
    tempPassword: string,
    pharmacyName: string,
    branchName: string,
    role: string,
  ) {
    await this.emailService.sendStaffCredentials(
      email,
      tempPassword,
      pharmacyName,
      branchName,
      role,
    );
  }

  async sendHospitalStaffCredentials(
    email: string,
    tempPassword: string,
    hospitalName: string,
    role: string,
  ) {
    await this.emailService.sendHospitalStaffCredentials(
      email,
      tempPassword,
      hospitalName,
      role,
    );
  }

  async sendAppointmentConfirmation(data: {
    email: string;
    recipientName: string;
    doctorName: string;
    patientName: string;
    hospitalName: string;
    date: Date;
    reason: string;
    appointmentId: string;
    role: 'PATIENT' | 'DOCTOR';
    appointmentType: 'ONLINE' | 'IN_PERSON';
    hospitalAddress?: string;
  }) {
    await this.emailService.sendAppointmentConfirmation(data);
  }

  async notifySuperAdminsNewHospital(hospitalId: string, hospitalName: string) {
    const superAdmins = await this.prisma.user.findMany({
      where: { role: 'SUPER_ADMIN' },
    });

    const title = 'New Hospital Application';
    const message = `${hospitalName} has registered and is pending approval.`;

    for (const admin of superAdmins) {
      await this.create({
        userId: admin.id,
        type: 'PHARMACY_APPROVED',
        title,
        message,
      });
    }

    await this.emailService.sendSuperAdminAlert(
      title,
      message,
      'Review Hospital',
      `${process.env.FRONTEND_URL || 'http://localhost:3000'}/super-admin/hospitals`,
    );
  }

  async sendStockAlertNotification(
    userIds: string[],
    email: string,
    itemName: string,
    itemType: string,
    currentQuantity: number,
    threshold: number,
    facilityName: string,
  ) {
    const title = 'Critical Stock Alert';
    const message = `Inventory for ${itemName} (${itemType}) has dropped to ${currentQuantity} (Threshold: ${threshold}).`;

    for (const userId of userIds) {
      await this.create({
        userId,
        type: 'LOW_STOCK',
        title,
        message,
      });
    }

    await this.emailService.sendStockAlertEmail(
      email,
      itemName,
      itemType,
      currentQuantity,
      threshold,
      facilityName,
    );
  }

  async sendExpiryAlertNotification(
    userIds: string[],
    email: string,
    itemName: string,
    itemType: string,
    batchNumber: string | null,
    daysLeft: number,
    expiryDate: string,
    facilityName: string,
  ) {
    const title = 'Upcoming Expiry Warning';
    const message = `${itemName} (${itemType}) is expiring in ${daysLeft} days.`;

    for (const userId of userIds) {
      await this.create({
        userId,
        type: 'EXPIRY_WARNING',
        title,
        message,
      });
    }

    await this.emailService.sendExpiryAlertEmail(
      email,
      itemName,
      itemType,
      batchNumber,
      daysLeft,
      expiryDate,
      facilityName,
    );
  }
}
