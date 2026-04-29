// backend/src/super-admin/super-admin.controller.ts
// FIXED VERSION - Added document preview endpoints and patient list

import {
  Controller,
  Get,
  Put,
  Patch,
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
import {
  ApprovePharmacyDto,
  RejectPharmacyDto,
  RejectBranchDto,
  VerifyLocationDto,
} from './dto';

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

  @Get('pharmacies/unverified-locations')
  @ApiOperation({
    summary:
      'Get pharmacies with coordinates that are not yet location-verified',
  })
  getUnverifiedLocations() {
    return this.superAdminService.getUnverifiedLocations();
  }

  @Get('pharmacies/:id')
  @ApiOperation({ summary: 'Get pharmacy by ID with full details' })
  getPharmacyById(@Param('id') id: string) {
    return this.superAdminService.getPharmacyById(id);
  }

  // NEW: Document Preview Endpoints
  @Get('pharmacies/:id/documents/rdb-certificate')
  @ApiOperation({ summary: 'Get RDB Certificate URL for preview' })
  getRdbCertificate(@Param('id') id: string) {
    return this.superAdminService.getPharmacyDocument(id, 'rdb');
  }

  @Get('pharmacies/:id/documents/pharmacy-license')
  @ApiOperation({ summary: 'Get Pharmacy License URL for preview' })
  getPharmacyLicense(@Param('id') id: string) {
    return this.superAdminService.getPharmacyDocument(id, 'license');
  }

  // PATCH method for frontend compatibility
  @Patch('pharmacies/:id/approve')
  @ApiOperation({ summary: 'Approve pharmacy (PATCH)' })
  patchApprovePharmacy(
    @Param('id') id: string,
    @Body() dto: ApprovePharmacyDto,
  ) {
    return this.superAdminService.approvePharmacy(id, dto);
  }

  // Keep PUT for backward compatibility
  @Put('pharmacies/:id/approve')
  @ApiOperation({ summary: 'Approve pharmacy (PUT)' })
  putApprovePharmacy(@Param('id') id: string, @Body() dto: ApprovePharmacyDto) {
    return this.superAdminService.approvePharmacy(id, dto);
  }

  // PATCH method for frontend compatibility
  @Patch('pharmacies/:id/reject')
  @ApiOperation({ summary: 'Reject pharmacy (PATCH)' })
  patchRejectPharmacy(@Param('id') id: string, @Body() dto: RejectPharmacyDto) {
    return this.superAdminService.rejectPharmacy(id, dto);
  }

  // Keep PUT for backward compatibility
  @Put('pharmacies/:id/reject')
  @ApiOperation({ summary: 'Reject pharmacy (PUT)' })
  putRejectPharmacy(@Param('id') id: string, @Body() dto: RejectPharmacyDto) {
    return this.superAdminService.rejectPharmacy(id, dto);
  }

  // Get all patients
  @Get('patients')
  @ApiOperation({ summary: 'Get all patients' })
  getAllPatients() {
    return this.superAdminService.getAllPatients();
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

  @Patch('pharmacies/:id/verify-location')
  @ApiOperation({ summary: 'Verify or flag pharmacy location coordinates' })
  verifyPharmacyLocation(
    @Param('id') id: string,
    @Body() dto: VerifyLocationDto,
  ) {
    return this.superAdminService.verifyPharmacyLocation(id, dto);
  }

  @Get('branches/unverified-locations')
  @ApiOperation({ summary: 'Get branches with unverified locations' })
  getUnverifiedBranchLocations() {
    return this.superAdminService.getUnverifiedBranchLocations();
  }

  @Patch('branches/:id/verify-location')
  @ApiOperation({ summary: 'Verify branch location' })
  verifyBranchLocation(
    @Param('id') id: string,
    @Body() dto: VerifyLocationDto,
  ) {
    return this.superAdminService.verifyBranchLocation(id, dto);
  }

  @Get('branches/pending')
  @ApiOperation({ summary: 'Get pending branch applications' })
  getPendingBranches() {
    return this.superAdminService.getPendingBranches();
  }

  @Patch('branches/:id/approve')
  @ApiOperation({ summary: 'Approve branch' })
  approveBranch(@Param('id') id: string) {
    return this.superAdminService.approveBranch(id);
  }

  @Patch('branches/:id/reject')
  @ApiOperation({ summary: 'Reject branch' })
  rejectBranch(@Param('id') id: string, @Body() dto: RejectBranchDto) {
    return this.superAdminService.rejectBranch(id, dto.reason);
  }
}
