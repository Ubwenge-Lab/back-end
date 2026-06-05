// src/reports/reports.controller.ts

import { Controller, Get, Query, Req, Res, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiProduces,
  ApiResponse,
} from '@nestjs/swagger';
import { Response } from 'express';
import { ReportsService } from './reports.service';
import { ExportQueryDto } from './dto/export-query.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../common/constants/role.enum';

@ApiTags('Reports')
@Controller('reports/export')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  // ========================================
  // GET /reports/export/appointments
  // ========================================

  @Get('appointments')
  @Roles(Role.HOSPITAL_ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Export appointments as CSV (Hospital Admin / Super Admin)',
  })
  @ApiProduces('text/csv')
  @ApiResponse({
    status: 200,
    description: 'CSV file download of appointment data',
  })
  async exportAppointments(
    @Req() req: any,
    @Res() res: Response,
    @Query() dto: ExportQueryDto,
  ) {
    const csv = await this.reportsService.exportAppointments(
      req.user.sub,
      req.user.role,
      dto,
    );

    const filename = `appointments-report-${new Date().toISOString().slice(0, 10)}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  }

  // ========================================
  // GET /reports/export/revenue
  // ========================================

  @Get('revenue')
  @Roles(Role.HOSPITAL_ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Export revenue / invoices as CSV (Hospital Admin / Super Admin)',
  })
  @ApiProduces('text/csv')
  @ApiResponse({
    status: 200,
    description: 'CSV file download of revenue/invoice data',
  })
  async exportRevenue(
    @Req() req: any,
    @Res() res: Response,
    @Query() dto: ExportQueryDto,
  ) {
    const csv = await this.reportsService.exportRevenue(
      req.user.sub,
      req.user.role,
      dto,
    );

    const filename = `revenue-report-${new Date().toISOString().slice(0, 10)}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  }

  // ========================================
  // GET /reports/export/prescriptions
  // ========================================

  @Get('prescriptions')
  @Roles(Role.HOSPITAL_ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({
    summary:
      'Export prescriptions as CSV — privacy-safe, no drug names (Hospital Admin / Super Admin)',
  })
  @ApiProduces('text/csv')
  @ApiResponse({
    status: 200,
    description:
      'CSV file download of prescription data (drug names excluded for privacy)',
  })
  async exportPrescriptions(
    @Req() req: any,
    @Res() res: Response,
    @Query() dto: ExportQueryDto,
  ) {
    const csv = await this.reportsService.exportPrescriptions(
      req.user.sub,
      req.user.role,
      dto,
    );

    const filename = `prescriptions-report-${new Date().toISOString().slice(0, 10)}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  }
}
