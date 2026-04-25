// backend/src/attendance/attendance.controller.ts

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
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { AttendanceService } from './attendance.service';
import {
  ClockInDto,
  ClockOutDto,
  ApproveClockInDto,
  RejectClockInDto,
  ApproveClockOutDto,
  RejectClockOutDto,
} from './dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../common/constants/role.enum';
import { AttendanceStatus } from '@prisma/client';

@ApiTags('Attendance')
@Controller('attendance')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class AttendanceController {
  constructor(private readonly attendanceService: AttendanceService) {}

  // ========================================
  // STAFF ENDPOINTS
  // ========================================

  @Post('clock-in')
  @Roles(Role.PHARMACIST, Role.CASHIER, Role.NURSE)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Staff initiates clock-in (requires manager approval)',
  })
  clockIn(@Req() req: any, @Body() dto: ClockInDto) {
    return this.attendanceService.clockIn(req.user.sub, dto);
  }

  @Post('clock-out')
  @Roles(Role.PHARMACIST, Role.CASHIER, Role.NURSE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Staff initiates clock-out (requires manager approval)',
  })
  clockOut(@Req() req: any, @Body() dto: ClockOutDto) {
    return this.attendanceService.clockOut(req.user.sub, dto);
  }

  @Get('my-attendance')
  @Roles(Role.PHARMACIST, Role.CASHIER, Role.NURSE)
  @ApiOperation({ summary: 'Get my attendance history' })
  @ApiQuery({ name: 'startDate', required: false, type: String })
  @ApiQuery({ name: 'endDate', required: false, type: String })
  getMyAttendance(
    @Req() req: any,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const start = startDate ? new Date(startDate) : undefined;
    const end = endDate ? new Date(endDate) : undefined;
    return this.attendanceService.getMyAttendance(req.user.sub, start, end);
  }

  @Get('my-current')
  @Roles(Role.PHARMACIST, Role.CASHIER, Role.NURSE)
  @ApiOperation({ summary: 'Get my current/active attendance (today)' })
  getMyCurrentAttendance(@Req() req: any) {
    return this.attendanceService.getMyCurrentAttendance(req.user.sub);
  }

  // ========================================
  // MANAGER ENDPOINTS
  // ========================================

  @Get('pending-clock-ins')
  @Roles(Role.BRANCH_MANAGER)
  @ApiOperation({ summary: 'Get all pending clock-in requests (Manager only)' })
  getPendingClockIns(@Req() req: any) {
    return this.attendanceService.getPendingClockIns(req.user.sub);
  }

  @Get('pending-clock-outs')
  @Roles(Role.BRANCH_MANAGER)
  @ApiOperation({
    summary: 'Get all pending clock-out requests (Manager only)',
  })
  getPendingClockOuts(@Req() req: any) {
    return this.attendanceService.getPendingClockOuts(req.user.sub);
  }

  @Put(':id/approve-clock-in')
  @Roles(Role.BRANCH_MANAGER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Approve staff clock-in (Manager only)' })
  approveClockIn(
    @Req() req: any,
    @Param('id') attendanceId: string,
    @Body() dto: ApproveClockInDto,
  ) {
    return this.attendanceService.approveClockIn(
      req.user.sub,
      attendanceId,
      dto,
    );
  }

  @Put(':id/reject-clock-in')
  @Roles(Role.BRANCH_MANAGER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reject staff clock-in (Manager only)' })
  rejectClockIn(
    @Req() req: any,
    @Param('id') attendanceId: string,
    @Body() dto: RejectClockInDto,
  ) {
    return this.attendanceService.rejectClockIn(
      req.user.sub,
      attendanceId,
      dto,
    );
  }

  @Put(':id/approve-clock-out')
  @Roles(Role.BRANCH_MANAGER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Approve staff clock-out (Manager only)' })
  approveClockOut(
    @Req() req: any,
    @Param('id') attendanceId: string,
    @Body() dto: ApproveClockOutDto,
  ) {
    return this.attendanceService.approveClockOut(
      req.user.sub,
      attendanceId,
      dto,
    );
  }

  @Put(':id/reject-clock-out')
  @Roles(Role.BRANCH_MANAGER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reject staff clock-out (Manager only)' })
  rejectClockOut(
    @Req() req: any,
    @Param('id') attendanceId: string,
    @Body() dto: RejectClockOutDto,
  ) {
    return this.attendanceService.rejectClockOut(
      req.user.sub,
      attendanceId,
      dto,
    );
  }

  @Get('branch')
  @Roles(Role.BRANCH_MANAGER)
  @ApiOperation({
    summary: 'Get all attendance records for branch (Manager only)',
  })
  @ApiQuery({ name: 'staffId', required: false, type: String })
  @ApiQuery({ name: 'status', required: false, enum: AttendanceStatus })
  @ApiQuery({ name: 'startDate', required: false, type: String })
  @ApiQuery({ name: 'endDate', required: false, type: String })
  getBranchAttendance(
    @Req() req: any,
    @Query('staffId') staffId?: string,
    @Query('status') status?: AttendanceStatus,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.attendanceService.getBranchAttendance(req.user.sub, {
      staffId,
      status,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
    });
  }

  @Get('summary')
  @Roles(Role.BRANCH_MANAGER)
  @ApiOperation({ summary: 'Get attendance summary/statistics (Manager only)' })
  @ApiQuery({ name: 'startDate', required: false, type: String })
  @ApiQuery({ name: 'endDate', required: false, type: String })
  getAttendanceSummary(
    @Req() req: any,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const start = startDate ? new Date(startDate) : undefined;
    const end = endDate ? new Date(endDate) : undefined;
    return this.attendanceService.getAttendanceSummary(
      req.user.sub,
      start,
      end,
    );
  }
}
