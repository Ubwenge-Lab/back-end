// src/reports/reports-analytics.controller.ts

import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiResponse,
} from '@nestjs/swagger';
import { ReportsService } from './reports.service';
import { AnalyticsQueryDto } from './dto/analytics-query.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../common/constants/role.enum';

@ApiTags('Reports - Analytics')
@Controller('reports')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class ReportsAnalyticsController {
  constructor(private readonly reportsService: ReportsService) {}

  // ========================================
  // GET /reports/financial/aging
  // ========================================

  @Get('financial/aging')
  @Roles(Role.HOSPITAL_ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({
    summary:
      'Insurance claims aging report (0-30/31-60/61-90/90+ days), from materialized view',
  })
  @ApiResponse({
    status: 200,
    description: 'Aging buckets with claim counts and outstanding totals',
  })
  async getFinancialAging(@Req() req: any, @Query() dto: AnalyticsQueryDto) {
    return this.reportsService.getFinancialAging(
      req.user.sub,
      req.user.role,
      dto,
    );
  }

  // ========================================
  // GET /reports/department/metrics
  // ========================================

  @Get('department/metrics')
  @Roles(Role.HOSPITAL_ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({
    summary:
      'Daily department performance metrics (revenue, throughput, consultations, approx. wait time)',
  })
  @ApiResponse({
    status: 200,
    description: 'Per-department, per-day rollups from materialized view',
  })
  async getDepartmentMetrics(@Req() req: any, @Query() dto: AnalyticsQueryDto) {
    return this.reportsService.getDepartmentMetrics(
      req.user.sub,
      req.user.role,
      dto,
    );
  }
}
