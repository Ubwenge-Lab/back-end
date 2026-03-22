// backend/src/pharmacies/pharmacies.controller.ts
// COMPLETE VERSION - All Endpoints Including Stats, Analytics, Patients

import {
  Controller,
  Get,
  Put,
  Patch,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiOkResponse } from '@nestjs/swagger';
import { PharmaciesService } from './pharmacies.service';
import { UpdatePharmacyDto } from './dto/update-pharmacy.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../common/constants/role.enum';
import { PharmacyStatsResponseDto } from './dto/stats-response.dto';

@ApiTags('Pharmacies')
@Controller('pharmacies')
export class PharmaciesController {
  constructor(private pharmaciesService: PharmaciesService) {}

  // ========================================
  // PUBLIC ENDPOINTS
  // ========================================

  @Get()
  @ApiOperation({ summary: 'Get all approved pharmacies (Public)' })
  getApprovedPharmacies() {
    return this.pharmaciesService.getApprovedPharmacies();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get pharmacy by ID (Public)' })
  getPharmacyById(@Param('id') id: string) {
    return this.pharmaciesService.findById(id);
  }

  // ========================================
  // PHARMACY AUTHENTICATED ENDPOINTS
  // ========================================

  // Dashboard Statistics
  @Get('dashboard/stats')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.PHARMACY)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get pharmacy dashboard statistics' })
  @ApiOkResponse({ type: PharmacyStatsResponseDto, description: 'Dashboard stats for the authenticated pharmacy' })
  getStats(@Req() req: any) {
    return this.pharmaciesService.getStats(req.user.sub);
  }

  // Analytics
  @Get('dashboard/analytics')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.PHARMACY)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get pharmacy analytics data' })
  getAnalytics(@Req() req: any) {
    return this.pharmaciesService.getAnalytics(req.user.sub);
  }

  // Daily Revenue — last 30 days, total + per branch
  @Get('dashboard/daily-revenue')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.PHARMACY)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get daily revenue for the past 30 days (total + per branch)' })
  getDailyRevenue(@Req() req: any) {
    return this.pharmaciesService.getDailyRevenue(req.user.sub);
  }

  // Weekly Revenue — last 30 days (4 weeks), total + per branch
  @Get('dashboard/weekly-revenue')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.PHARMACY)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get weekly revenue for the past 30 days (total + per branch)' })
  getWeeklyRevenue(@Req() req: any) {
    return this.pharmaciesService.getWeeklyRevenue(req.user.sub);
  }

  // View All Past Patients
  @Get('dashboard/patients')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.PHARMACY)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get all past patients with order history' })
  getPatients(@Req() req: any) {
    return this.pharmaciesService.getPatients(req.user.sub);
  }

  // Profile
  @Get('profile/me')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.PHARMACY)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get pharmacy profile' })
  getProfile(@Req() req: any) {
    return this.pharmaciesService.getProfile(req.user.sub);
  }

  @Put('profile/me')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.PHARMACY)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update pharmacy profile (critical changes require admin approval)' })
  updateProfile(@Req() req: any, @Body() dto: UpdatePharmacyDto) {
    return this.pharmaciesService.updateProfile(req.user.sub, dto);
  }

  // Resubmit for rejected pharmacies
  @Patch('profile/resubmit')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.PHARMACY)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Resubmit pharmacy application with updated documents (for rejected pharmacies)' })
  resubmitApplication(@Req() req: any, @Body() dto: UpdatePharmacyDto) {
    return this.pharmaciesService.resubmitApplication(req.user.sub, dto);
  }

  // ========================================
  // BACKWARD COMPATIBILITY ALIASES
  // ========================================

  // Alias for stats (frontend may call /pharmacies/stats)
  @Get('stats')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.PHARMACY)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get pharmacy stats (alias)' })
  getStatsAlias(@Req() req: any) {
    return this.pharmaciesService.getStats(req.user.sub);
  }

  // Alias for analytics (frontend may call /pharmacies/analytics)
  @Get('analytics')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.PHARMACY)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get pharmacy analytics (alias)' })
  getAnalyticsAlias(@Req() req: any) {
    return this.pharmaciesService.getAnalytics(req.user.sub);
  }

  // Alias for profile GET (frontend may call /pharmacies/me)
  @Get('me')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.PHARMACY)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get pharmacy profile (alias)' })
  getProfileAlias(@Req() req: any) {
    return this.pharmaciesService.getProfile(req.user.sub);
  }

  // Alias for profile UPDATE (frontend may call PATCH /pharmacies/me)
  @Patch('me')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.PHARMACY)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update pharmacy profile (alias)' })
  updateProfileAlias(@Req() req: any, @Body() dto: UpdatePharmacyDto) {
    return this.pharmaciesService.updateProfile(req.user.sub, dto);
  }

  // ========================================
  // ADMIN ENDPOINTS
  // ========================================

  @Get('admin/pending')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get all pending pharmacies (Admin only)' })
  getPendingPharmacies() {
    return this.pharmaciesService.getPendingPharmacies();
  }

  @Get('admin/all')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get all pharmacies (Admin only)' })
  getAllPharmacies(@Query('status') status?: string) {
    return this.pharmaciesService.getAllPharmacies(status);
  }

  @Post('admin/:id/approve')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Approve or reject pharmacy (Admin only)' })
  approvePharmacy(
    @Param('id') id: string,
    @Body() body: { approved: boolean; rejectionReason?: string },
  ) {
    return this.pharmaciesService.approvePharmacy(id, body.approved, body.rejectionReason);
  }
}
