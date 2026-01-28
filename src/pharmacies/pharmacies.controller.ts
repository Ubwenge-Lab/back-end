// backend/src/pharmacies/pharmacies.controller.ts
// FIXED VERSION - Added resubmission endpoint for rejected pharmacies

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
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { PharmaciesService } from './pharmacies.service';
import { UpdatePharmacyDto } from './dto/update-pharmacy.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../common/constants/role.enum';

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
  // PHARMACY ENDPOINTS (Authenticated)
  // ========================================

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

  // NEW: Resubmit for rejected pharmacies
  @Patch('profile/resubmit')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.PHARMACY)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Resubmit pharmacy application with updated documents (for rejected pharmacies)' })
  resubmitApplication(@Req() req: any, @Body() dto: UpdatePharmacyDto) {
    return this.pharmaciesService.resubmitApplication(req.user.sub, dto);
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