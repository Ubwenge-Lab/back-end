// backend/src/staff/staff.controller.ts

import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { StaffService } from './staff.service';
import { CreateStaffDto, UpdateStaffDto, ChangeStaffPasswordDto } from './dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../common/constants/role.enum';

@ApiTags('Staff')
@Controller('staff')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class StaffController {
  constructor(private readonly staffService: StaffService) {}

  // ========================================
  // BRANCH MANAGER ENDPOINTS
  // ========================================

  @Post()
  @Roles(Role.BRANCH_MANAGER)
  @ApiOperation({ summary: 'Create staff member (Branch Manager only)' })
  createStaff(@Req() req: any, @Body() dto: CreateStaffDto) {
    return this.staffService.createStaff(req.user.sub, dto);
  }

  @Get()
  @Roles(Role.BRANCH_MANAGER)
  @ApiOperation({ summary: 'Get all staff in branch (Branch Manager only)' })
  getStaffInBranch(@Req() req: any) {
    return this.staffService.getStaffInBranch(req.user.sub);
  }

  @Get(':id')
  @Roles(Role.BRANCH_MANAGER)
  @ApiOperation({ summary: 'Get staff member by ID (Branch Manager only)' })
  getStaffById(@Req() req: any, @Param('id') id: string) {
    return this.staffService.getStaffById(req.user.sub, id);
  }

  @Put(':id')
  @Roles(Role.BRANCH_MANAGER)
  @ApiOperation({ summary: 'Update staff member (Branch Manager only)' })
  updateStaff(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateStaffDto,
  ) {
    return this.staffService.updateStaff(req.user.sub, id, dto);
  }

  @Delete(':id')
  @Roles(Role.BRANCH_MANAGER)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete staff member (Branch Manager only)' })
  async deleteStaff(@Req() req: any, @Param('id') id: string): Promise<void> {
    await this.staffService.deleteStaff(req.user.sub, id);
  }

  @Post(':id/resend-credentials')
  @Roles(Role.BRANCH_MANAGER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Resend credentials to staff member (Branch Manager only)',
  })
  resendCredentials(@Req() req: any, @Param('id') id: string) {
    return this.staffService.resendCredentials(req.user.sub, id);
  }

  // ========================================
  // STAFF ENDPOINTS
  // ========================================

  @Get('profile/me')
  @Roles(Role.PHARMACIST, Role.CASHIER, Role.NURSE)
  @ApiOperation({ summary: 'Get my staff profile' })
  getMyProfile(@Req() req: any) {
    return this.staffService.getMyProfile(req.user.sub);
  }

  @Put('profile/change-password')
  @Roles(Role.PHARMACIST, Role.CASHIER, Role.NURSE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Change password from temp to permanent (Staff first login)',
  })
  changePassword(@Req() req: any, @Body() dto: ChangeStaffPasswordDto) {
    return this.staffService.changeStaffPassword(req.user.sub, dto);
  }
}
