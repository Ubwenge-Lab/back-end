import { Controller, Get, Param, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import { AnalyticsService } from './analytics.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../common/constants/role.enum';

@ApiTags('Analytics')
@Controller('analytics')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('super-admin')
  @Roles(Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Get platform-wide aggregated metrics' })
  async getSuperAdminAnalytics() {
    return this.analyticsService.getSuperAdminMetrics();
  }

  @Get('hospital/:id')
  @Roles(Role.SUPER_ADMIN, Role.HOSPITAL_ADMIN)
  @ApiOperation({ summary: 'Get operational metrics for a specific hospital' })
  @ApiParam({ name: 'id', description: 'Hospital UUID' })
  async getHospitalAnalytics(@Param('id') hospitalId: string, @Req() req: any) {
    return this.analyticsService.getHospitalMetrics(hospitalId, req.user.sub, req.user.role);
  }

  @Get('doctor/:id')
  @Roles(Role.SUPER_ADMIN, Role.HOSPITAL_ADMIN, Role.DOCTOR)
  @ApiOperation({ summary: 'Get clinical metrics for a specific doctor' })
  @ApiParam({ name: 'id', description: 'Doctor UUID' })
  async getDoctorAnalytics(@Param('id') doctorId: string, @Req() req: any) {
    return this.analyticsService.getDoctorMetrics(doctorId, req.user.sub, req.user.role);
  }

  @Get('pharmacy/:id')
  @Roles(Role.SUPER_ADMIN, Role.PHARMACY)
  @ApiOperation({ summary: 'Get daily sales and inventory metrics for a pharmacy' })
  @ApiParam({ name: 'id', description: 'Pharmacy UUID' })
  async getPharmacyAnalytics(@Param('id') pharmacyId: string, @Req() req: any) {
    return this.analyticsService.getPharmacyMetrics(pharmacyId, req.user.sub, req.user.role);
  }
}