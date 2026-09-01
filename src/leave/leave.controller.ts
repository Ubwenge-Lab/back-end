// backend/src/leave/leave.controller.ts

import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { LeaveService } from './leave.service';
import {
  CreateLeaveRequestDto,
  ApproveLeaveRequestDto,
  RejectLeaveRequestDto,
  SetLeaveBalanceDto,
} from './dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../common/constants/role.enum';
import { Public } from '../auth/decorators/public.decorator';
import { LeaveStatus } from '@prisma/client';

@ApiTags('Leave')
@Controller('leave')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class LeaveController {
  constructor(private readonly leaveService: LeaveService) {}

  // ========================================
  // REFERENCE DATA
  // ========================================

  @Get('types')
  @Public()
  @ApiOperation({ summary: 'List all leave types recognised under Rwanda labour law' })
  getLeaveTypes() {
    return this.leaveService.getLeaveTypes();
  }

  // ========================================
  // EMPLOYEE ENDPOINTS (Staff + Branch Manager)
  // ========================================

  @Post('request')
  @Roles(Role.PHARMACIST, Role.CASHIER, Role.NURSE, Role.BRANCH_MANAGER)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Submit a leave request' })
  requestLeave(@Req() req: any, @Body() dto: CreateLeaveRequestDto) {
    return this.leaveService.requestLeave(req.user.sub, dto);
  }

  @Get('my-requests')
  @Roles(Role.PHARMACIST, Role.CASHIER, Role.NURSE, Role.BRANCH_MANAGER)
  @ApiOperation({ summary: 'Get my leave request history' })
  getMyLeaveRequests(@Req() req: any) {
    return this.leaveService.getMyLeaveRequests(req.user.sub);
  }

  @Put(':id/cancel')
  @Roles(Role.PHARMACIST, Role.CASHIER, Role.NURSE, Role.BRANCH_MANAGER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel my own pending leave request' })
  cancelMyLeaveRequest(@Req() req: any, @Param('id') id: string) {
    return this.leaveService.cancelMyLeaveRequest(req.user.sub, id);
  }

  @Get('my-balances')
  @Roles(Role.PHARMACIST, Role.CASHIER, Role.NURSE, Role.BRANCH_MANAGER)
  @ApiOperation({ summary: 'Get my leave balances for a given year' })
  @ApiQuery({ name: 'year', required: false, type: Number })
  getMyLeaveBalances(@Req() req: any, @Query('year') year?: string) {
    return this.leaveService.getMyLeaveBalances(req.user.sub, year ? Number(year) : undefined);
  }

  // ========================================
  // BRANCH MANAGER ENDPOINTS
  // (reviews leave + sets leave balances for their own branch's staff)
  // ========================================

  @Get('branch/requests')
  @Roles(Role.BRANCH_MANAGER)
  @ApiOperation({ summary: 'Get leave requests from staff in my branch (Manager only)' })
  @ApiQuery({ name: 'status', required: false, enum: LeaveStatus })
  getBranchLeaveRequests(@Req() req: any, @Query('status') status?: LeaveStatus) {
    return this.leaveService.getBranchLeaveRequests(req.user.sub, status);
  }

  @Get('branch/balances')
  @Roles(Role.BRANCH_MANAGER)
  @ApiOperation({ summary: "Get my branch staff's leave balances (Manager only)" })
  @ApiQuery({ name: 'year', required: false, type: Number })
  getBranchLeaveBalances(@Req() req: any, @Query('year') year?: string) {
    return this.leaveService.getBranchLeaveBalances(req.user.sub, year ? Number(year) : undefined);
  }

  @Put('branch/balances')
  @Roles(Role.BRANCH_MANAGER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Set annual/other leave day allocation for a staff member in my branch (Manager only)',
  })
  setBranchStaffLeaveBalance(@Req() req: any, @Body() dto: SetLeaveBalanceDto) {
    return this.leaveService.setBranchStaffLeaveBalance(req.user.sub, dto);
  }

  // ========================================
  // PHARMACY OWNER ENDPOINTS
  // (reviews leave + sets leave balances for anyone in the pharmacy)
  // ========================================

  @Get('pharmacy/requests')
  @Roles(Role.PHARMACY)
  @ApiOperation({ summary: 'Get leave requests across the whole pharmacy (Owner only)' })
  @ApiQuery({ name: 'status', required: false, enum: LeaveStatus })
  @ApiQuery({ name: 'branchId', required: false, type: String })
  getPharmacyLeaveRequests(
    @Req() req: any,
    @Query('status') status?: LeaveStatus,
    @Query('branchId') branchId?: string,
  ) {
    return this.leaveService.getPharmacyLeaveRequests(req.user.sub, { status, branchId });
  }

  @Get('pharmacy/balances')
  @Roles(Role.PHARMACY)
  @ApiOperation({ summary: "Get everyone's leave balances across the pharmacy (Owner only)" })
  @ApiQuery({ name: 'year', required: false, type: Number })
  getPharmacyLeaveBalances(@Req() req: any, @Query('year') year?: string) {
    return this.leaveService.getPharmacyLeaveBalances(req.user.sub, year ? Number(year) : undefined);
  }

  @Put('pharmacy/balances')
  @Roles(Role.PHARMACY)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Set leave day allocation for any employee in the pharmacy, including managers (Owner only)',
  })
  setPharmacyLeaveBalance(@Req() req: any, @Body() dto: SetLeaveBalanceDto) {
    return this.leaveService.setPharmacyLeaveBalance(req.user.sub, dto);
  }

  // ========================================
  // SHARED APPROVE / REJECT
  // (authorization is resolved inside the service: a branch manager can only
  // touch their own branch's staff; the owner can touch anyone in the
  // pharmacy, including branch managers)
  // ========================================

  @Put(':id/approve')
  @Roles(Role.BRANCH_MANAGER, Role.PHARMACY)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Approve a leave request (Manager for own branch, Owner for anyone)' })
  approveLeaveRequest(@Req() req: any, @Param('id') id: string, @Body() dto: ApproveLeaveRequestDto) {
    return this.leaveService.approveLeaveRequest(req.user.sub, id, dto);
  }

  @Put(':id/reject')
  @Roles(Role.BRANCH_MANAGER, Role.PHARMACY)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reject a leave request (Manager for own branch, Owner for anyone)' })
  rejectLeaveRequest(@Req() req: any, @Param('id') id: string, @Body() dto: RejectLeaveRequestDto) {
    return this.leaveService.rejectLeaveRequest(req.user.sub, id, dto);
  }
}
