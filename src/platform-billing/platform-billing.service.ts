import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';

const PLATFORM_SUBSCRIPTION_FEE = 50;

@Injectable()
export class PlatformBillingService {
  private readonly logger = new Logger(PlatformBillingService.name);

  constructor(private readonly prisma: PrismaService) {}

  // Runs on the 1st of every month at 00:00 UTC — ~30-day interval
  @Cron('0 0 1 * *', { name: 'platform-monthly-subscription' })
  async runMonthlySubscriptionBilling(): Promise<void> {
    this.logger.log('Starting monthly platform subscription billing run');

    const hospitals = await this.prisma.hospital.findMany({
      where: { status: 'APPROVED' },
      select: { id: true },
    });

    let processed = 0;
    let failed = 0;

    for (const hospital of hospitals) {
      try {
        await this.prisma.$transaction(async (tx) => {
          await tx.hospital.update({
            where: { id: hospital.id },
            data: {
              platformBalance: { decrement: PLATFORM_SUBSCRIPTION_FEE },
            },
          });

          await tx.platformSubscriptionCharge.create({
            data: {
              hospitalId: hospital.id,
              amount: PLATFORM_SUBSCRIPTION_FEE,
              description: 'Monthly platform subscription fee ($50)',
            },
          });
        });
        processed++;
      } catch (err: unknown) {
        failed++;
        const message = err instanceof Error ? err.message : String(err);
        this.logger.error(
          `Failed to bill hospital ${hospital.id}: ${message}`,
        );
      }
    }

    this.logger.log(
      `Monthly billing complete — processed: ${processed}, failed: ${failed}`,
    );
  }

  async getSubscriptionCharges(hospitalId: string) {
    return this.prisma.platformSubscriptionCharge.findMany({
      where: { hospitalId },
      orderBy: { chargedAt: 'desc' },
    });
  }
}
