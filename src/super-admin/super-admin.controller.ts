// backend/src/super-admin/super-admin.controller.ts

import {
  Controller,
  Get,
  Put,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { SuperAdminService } from './super-admin.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../common/constants/role.enum';
import { ApprovePharmacyDto, RejectPharmacyDto } from './dto';

@ApiTags('Super Admin')
@Controller('super-admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.SUPER_ADMIN)
@ApiBearerAuth()
export class SuperAdminController {
  constructor(private superAdminService: SuperAdminService) {}

  @Get('analytics')
  @ApiOperation({ summary: 'Get platform analytics' })
  getPlatformAnalytics() {
    return this.superAdminService.getPlatformAnalytics();
  }

  @Get('pharmacies/pending')
  @ApiOperation({ summary: 'Get pending pharmacy applications' })
  getPendingPharmacies() {
    return this.superAdminService.getPendingPharmacies();
  }

  @Get('pharmacies')
  @ApiOperation({ summary: 'Get all pharmacies' })
  getAllPharmacies(@Query('status') status?: string) {
    return this.superAdminService.getAllPharmacies(status);
  }

  @Get('pharmacies/:id')
  @ApiOperation({ summary: 'Get pharmacy by ID' })
  getPharmacyById(@Param('id') id: string) {
    return this.superAdminService.getPharmacyById(id);
  }

  @Put('pharmacies/:id/approve')
  @ApiOperation({ summary: 'Approve pharmacy' })
  approvePharmacy(@Param('id') id: string, @Body() dto: ApprovePharmacyDto) {
    return this.superAdminService.approvePharmacy(id, dto);
  }

  @Put('pharmacies/:id/reject')
  @ApiOperation({ summary: 'Reject pharmacy' })
  rejectPharmacy(@Param('id') id: string, @Body() dto: RejectPharmacyDto) {
    return this.superAdminService.rejectPharmacy(id, dto);
  }

  @Get('orders/recent')
  @ApiOperation({ summary: 'Get recent orders' })
  getRecentOrders(@Query('limit') limit?: string) {
    return this.superAdminService.getRecentOrders(limit ? parseInt(limit) : 20);
  }

  @Get('revenue')
  @ApiOperation({ summary: 'Get revenue analytics' })
  getRevenueAnalytics(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.superAdminService.getRevenueAnalytics(
      startDate ? new Date(startDate) : undefined,
      endDate ? new Date(endDate) : undefined,
    );
  }
}