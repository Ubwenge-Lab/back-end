// src/reports/reports.module.ts

import { Module } from '@nestjs/common';
import { ReportsController } from './reports.controller';
import { ReportsAnalyticsController } from './reports-analytics.controller';
import { ReportsService } from './reports.service';
import { ReportsRefreshJob } from './jobs/refresh-views.job';
import { PrismaModule } from '../prisma/prisma.module';
import { MohSurveillanceListener } from './moh-surveillance.listener';

@Module({
  imports: [PrismaModule],
  controllers: [ReportsController, ReportsAnalyticsController],
  providers: [ReportsService, ReportsRefreshJob, MohSurveillanceListener],
  exports: [ReportsService],
})
export class ReportsModule {}
