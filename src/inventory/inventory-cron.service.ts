import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../notifications/email.service';
import { NotificationType } from '@prisma/client';

@Injectable()
export class InventoryCronService {
  private readonly logger = new Logger(InventoryCronService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async checkLowStock() {
    this.logger.log('Starting daily checkLowStock cron job...');
    
    // Check Hospital Consumables
    // Prisma field references in findMany aren't fully supported natively, we'll map or raw query
    // Actually, we can just findMany and filter, but raw query or direct comparison is better if db supports it.
    // For simplicity and since Prisma 5 added relation/field comparisons somewhat, we can fetch all and filter in memory if small, or use raw.
    // Given memory constraints in node for large datasets, let's just query raw or fetch and filter
    const consumables = await this.prisma.hospitalConsumableStock.findMany({
      include: { hospital: { include: { user: true } } }
    });

    const lowConsumables = consumables.filter(c => c.quantity < c.criticalThreshold);

    for (const item of lowConsumables) {
      const message = `Critical Low Stock Alert: ${item.itemName} has dropped to ${item.quantity} (Below threshold of ${item.criticalThreshold}).`;
      
      // In-App Notification
      await this.prisma.notification.create({
        data: {
          userId: item.hospital.userId,
          title: 'Low Stock Alert',
          message,
          type: NotificationType.LOW_STOCK,
        }
      });

      // Email Alert (assuming emailService has sendCustomEmail or we log if missing)
      // We will just use baseTemplate if we don't have sendCustomEmail
      if ((this.emailService as any).sendCustomEmail) {
         await (this.emailService as any).sendCustomEmail(item.hospital.user.email, 'Evuze Inventory Alert: Low Stock', message);
      } else {
         this.logger.log(`Email Alert to ${item.hospital.user.email}: ${message}`);
      }
    }
    
    // Check Pharmacy Medications
    const meds = await this.prisma.medication.findMany({
      include: { pharmacy: { include: { user: true } } }
    });
    
    const lowMeds = meds.filter(m => m.quantity < m.lowStockThreshold);

    for (const item of lowMeds) {
      const message = `Critical Low Stock Alert: ${item.name} has dropped to ${item.quantity} (Below threshold of ${item.lowStockThreshold}).`;
      
      await this.prisma.notification.create({
        data: {
          userId: item.pharmacy.userId,
          title: 'Low Stock Alert',
          message,
          type: NotificationType.LOW_STOCK,
        }
      });

      if ((this.emailService as any).sendCustomEmail) {
         await (this.emailService as any).sendCustomEmail(item.pharmacy.user.email, 'Evuze Inventory Alert: Low Stock', message);
      } else {
         this.logger.log(`Email Alert to ${item.pharmacy.user.email}: ${message}`);
      }
    }

    this.logger.log('checkLowStock cron job completed.');
  }

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async checkExpiryDates() {
    this.logger.log('Starting daily checkExpiryDates cron job...');
    
    // Calculate cutoff dates exactly at midnight
    const today = new Date();
    today.setHours(0,0,0,0);
    
    const days30 = new Date(today); days30.setDate(days30.getDate() + 30);
    const days60 = new Date(today); days60.setDate(days60.getDate() + 60);
    const days90 = new Date(today); days90.setDate(days90.getDate() + 90);

    const checkDates = [days30, days60, days90];

    for (const targetDate of checkDates) {
      const nextDay = new Date(targetDate);
      nextDay.setDate(nextDay.getDate() + 1);

      // HospitalDrugStock expiry check
      const expiringDrugs = await this.prisma.hospitalDrugStock.findMany({
        where: {
          expiryDate: {
            gte: targetDate,
            lt: nextDay
          }
        },
        include: { hospital: { include: { user: true } }, drug: true }
      });

      for (const item of expiringDrugs) {
        const daysLeft = Math.round((targetDate.getTime() - today.getTime()) / (1000 * 3600 * 24));
        const message = `Expiry Warning: ${item.drug.genericName} is expiring in exactly ${daysLeft} days (on ${item.expiryDate.toLocaleDateString()}).`;
        
        await this.prisma.notification.create({
          data: {
            userId: item.hospital.userId,
            title: 'Expiry Warning',
            message,
            type: NotificationType.EXPIRY_WARNING,
          }
        });

        if ((this.emailService as any).sendCustomEmail) {
           await (this.emailService as any).sendCustomEmail(item.hospital.user.email, 'Evuze Inventory Alert: Expiry Warning', message);
        } else {
           this.logger.log(`Email Alert to ${item.hospital.user.email}: ${message}`);
        }
      }
    }

    this.logger.log('checkExpiryDates cron job completed.');
  }
}
