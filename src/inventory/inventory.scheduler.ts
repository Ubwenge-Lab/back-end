import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class InventoryScheduler {
  private readonly logger = new Logger(InventoryScheduler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async checkLowStock() {
    this.logger.log('Running daily low stock checks...');

    // 1. Check Hospital Consumables
    const hospitalConsumables = await this.prisma.hospitalConsumableStock.findMany({
      where: {
        quantity: {
          lte: this.prisma.hospitalConsumableStock.fields.criticalThreshold,
        },
      },
    });

    for (const stock of hospitalConsumables) {
      const hospital = await this.prisma.hospital.findUnique({
        where: { id: stock.hospitalId },
        include: {
          staff: {
            where: { user: { role: { in: ['HOSPITAL_ADMIN', 'SUPER_ADMIN'] } } },
            include: { user: true },
          },
        },
      });

      if (!hospital) continue;

      const admins = hospital.staff.map((s) => s.user).filter((u) => u);
      const userIds = admins.map((a) => a.id);
      const primaryAdminEmail = admins.length > 0 ? admins[0].email : null;

      if (primaryAdminEmail) {
        await this.notificationsService.sendStockAlertNotification(
          userIds,
          primaryAdminEmail,
          stock.itemName,
          'Hospital Consumable',
          stock.quantity,
          stock.criticalThreshold,
          hospital.name,
        );
      }
    }

    // 2. Check Hospital Drugs
    const hospitalDrugs = await this.prisma.hospitalDrugStock.findMany({
      where: {
        quantity: {
          lte: this.prisma.hospitalDrugStock.fields.reorderLevel,
        },
      },
      include: {
        drug: true,
        hospital: {
          include: {
            staff: {
              where: { user: { role: { in: ['HOSPITAL_ADMIN', 'PHARMACIST', 'SUPER_ADMIN'] } } },
              include: { user: true },
            },
          },
        },
      },
    });

    for (const stock of hospitalDrugs) {
      const admins = stock.hospital.staff.map((s) => s.user).filter((u) => u);
      const userIds = admins.map((a) => a.id);
      const primaryAdminEmail = admins.length > 0 ? admins[0].email : null;

      if (primaryAdminEmail) {
        await this.notificationsService.sendStockAlertNotification(
          userIds,
          primaryAdminEmail,
          stock.drug.brandName,
          'Hospital Drug',
          stock.quantity,
          stock.reorderLevel,
          stock.hospital.name,
        );
      }
    }

    // 3. Check Pharmacy Medications
    const pharmacyMedications = await this.prisma.medication.findMany({
      where: {
        quantity: {
          lte: this.prisma.medication.fields.lowStockThreshold,
        },
      },
      include: {
        pharmacy: {
          include: {
            user: true,
          },
        },
      },
    });

    for (const med of pharmacyMedications) {
      const owner = med.pharmacy?.user;
      if (!owner || !med.pharmacy) continue;

      await this.notificationsService.sendStockAlertNotification(
        [owner.id],
        owner.email,
        med.name,
        'Pharmacy Medication',
        med.quantity,
        med.lowStockThreshold,
        med.pharmacy.name,
      );
    }

    this.logger.log('Completed low stock checks.');
  }

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async checkExpiryDates() {
    this.logger.log('Running daily expiry date checks...');
    
    const today = new Date();
    const thresholds = [30, 60, 90];

    // Check Hospital Drugs
    const hospitalDrugs = await this.prisma.hospitalDrugStock.findMany({
      where: { quantity: { gt: 0 } },
      include: {
        drug: true,
        hospital: {
          include: {
            staff: {
              where: { user: { role: { in: ['HOSPITAL_ADMIN', 'PHARMACIST', 'SUPER_ADMIN'] } } },
              include: { user: true },
            },
          },
        },
      },
    });

    for (const stock of hospitalDrugs) {
      if (!stock.expiryDate) continue;
      const daysLeft = Math.ceil((stock.expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

      if (thresholds.includes(daysLeft)) {
        const admins = stock.hospital.staff.map((s) => s.user).filter((u) => u);
        const userIds = admins.map((a) => a.id);
        const primaryAdminEmail = admins.length > 0 ? admins[0].email : null;

        if (primaryAdminEmail) {
          await this.notificationsService.sendExpiryAlertNotification(
            userIds,
            primaryAdminEmail,
            stock.drug.brandName,
            'Hospital Drug',
            null,
            daysLeft,
            stock.expiryDate.toISOString().split('T')[0],
            stock.hospital.name,
          );
        }
      }
    }

    // Check Pharmacy Medications
    const pharmacyMedications = await this.prisma.medication.findMany({
      where: { quantity: { gt: 0 }, expiryDate: { not: null } },
      include: {
        pharmacy: {
          include: {
            user: true,
          },
        },
      },
    });

    for (const med of pharmacyMedications) {
      if (!med.expiryDate || !med.pharmacy || !med.pharmacy.user) continue;
      const daysLeft = Math.ceil((med.expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

      if (thresholds.includes(daysLeft)) {
        await this.notificationsService.sendExpiryAlertNotification(
          [med.pharmacy.user.id],
          med.pharmacy.user.email,
          med.name,
          'Pharmacy Medication',
          med.batchNumber,
          daysLeft,
          med.expiryDate.toISOString().split('T')[0],
          med.pharmacy.name,
        );
      }
    }

    this.logger.log('Completed expiry date checks.');
  }
}
