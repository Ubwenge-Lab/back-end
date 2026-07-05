import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ReportsRefreshJob {
  private readonly logger = new Logger(ReportsRefreshJob.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async handleRefresh() {
    this.logger.log(
      'Starting nightly refresh of reporting materialized views...',
    );

    await this.refreshView('mv_financial_aging');
    await this.refreshView('mv_department_daily_metrics');

    this.logger.log('Nightly materialized view refresh cycle complete.');
  }

  private async refreshView(viewName: string) {
    try {
      await this.prisma.$executeRawUnsafe(
        `REFRESH MATERIALIZED VIEW CONCURRENTLY ${viewName}`,
      );
      this.logger.log(`Refreshed ${viewName} successfully.`);
    } catch (error) {
      this.logger.error(`Failed to refresh ${viewName}`, error);
    }
  }
}
