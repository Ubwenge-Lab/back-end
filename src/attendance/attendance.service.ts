// backend/src/attendance/attendance.service.ts

import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AttendanceStatus } from '@prisma/client';
import {
  ClockInDto,
  ClockOutDto,
  ApproveClockInDto,
  RejectClockInDto,
  ApproveClockOutDto,
  RejectClockOutDto,
} from './dto';

@Injectable()
export class AttendanceService {
  constructor(private readonly prisma: PrismaService) {}

  // ========================================
  // STAFF ENDPOINTS - Clock In/Out
  // ========================================

  /**
   * Staff initiates clock-in (requires manager approval)
   */
  async clockIn(userId: string, dto: ClockInDto) {
    const staff = await this.prisma.staff.findUnique({
      where: { userId },
      include: { branch: true },
    });

    if (!staff) {
      throw new NotFoundException('Staff profile not found');
    }

    if (staff.status !== 'ACTIVE') {
      throw new ForbiddenException('Only active staff can clock in');
    }

    // Check if staff already has a pending or approved clock-in today
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const existingClockIn = await this.prisma.attendance.findFirst({
      where: {
        staffId: staff.id,
        clockInTime: {
          gte: today,
          lt: tomorrow,
        },
        status: {
          in: ['PENDING', 'APPROVED', 'CLOCKED_OUT'],
        },
      },
    });

    if (existingClockIn) {
      throw new ConflictException('You have already clocked in today');
    }

    const attendance = await this.prisma.attendance.create({
      data: {
        staffId: staff.id,
        branchId: staff.branchId,
        clockInTime: new Date(),
        clockInLocation: dto.location || null,
        status: AttendanceStatus.PENDING,
      },
      include: {
        staff: {
          include: {
            user: { select: { email: true } },
          },
        },
      },
    });

    return {
      message: 'Clock-in request submitted. Waiting for manager approval.',
      attendance,
    };
  }

  /**
   * Staff initiates clock-out (requires manager approval)
   */
  async clockOut(userId: string, dto: ClockOutDto) {
    const staff = await this.prisma.staff.findUnique({
      where: { userId },
    });

    if (!staff) {
      throw new NotFoundException('Staff profile not found');
    }

    // Find today's approved attendance record
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const attendance = await this.prisma.attendance.findFirst({
      where: {
        staffId: staff.id,
        clockInTime: {
          gte: today,
          lt: tomorrow,
        },
        status: AttendanceStatus.APPROVED,
        clockOutTime: null,
      },
      orderBy: { clockInTime: 'desc' },
    });

    if (!attendance) {
      throw new BadRequestException(
        'No approved clock-in found for today. Cannot clock out.',
      );
    }

    const updated = await this.prisma.attendance.update({
      where: { id: attendance.id },
      data: {
        clockOutTime: new Date(),
        clockOutLocation: dto.location || null,
        notes: dto.notes,
        status: AttendanceStatus.CLOCKED_OUT,
      },
      include: {
        staff: {
          include: {
            user: { select: { email: true } },
          },
        },
      },
    });

    return {
      message: 'Clock-out request submitted. Waiting for manager approval.',
      attendance: updated,
    };
  }

  /**
   * Get my attendance history
   */
  async getMyAttendance(userId: string, startDate?: Date, endDate?: Date) {
    const staff = await this.prisma.staff.findUnique({
      where: { userId },
    });

    if (!staff) {
      throw new NotFoundException('Staff profile not found');
    }

    const where: any = { staffId: staff.id };

    if (startDate || endDate) {
      where.clockInTime = {};
      if (startDate) where.clockInTime.gte = startDate;
      if (endDate) where.clockInTime.lte = endDate;
    }

    const attendances = await this.prisma.attendance.findMany({
      where,
      orderBy: { clockInTime: 'desc' },
      include: {
        clockInApprover: {
          select: {
            firstName: true,
            lastName: true,
          },
        },
        clockOutApprover: {
          select: {
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    return attendances;
  }

  /**
   * Get my current/active attendance (today's shift)
   */
  async getMyCurrentAttendance(userId: string) {
    const staff = await this.prisma.staff.findUnique({
      where: { userId },
    });

    if (!staff) {
      throw new NotFoundException('Staff profile not found');
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const attendance = await this.prisma.attendance.findFirst({
      where: {
        staffId: staff.id,
        clockInTime: {
          gte: today,
          lt: tomorrow,
        },
        status: {
          in: ['PENDING', 'APPROVED', 'CLOCKED_OUT'],
        },
      },
      orderBy: { clockInTime: 'desc' },
      include: {
        clockInApprover: {
          select: {
            firstName: true,
            lastName: true,
          },
        },
        clockOutApprover: {
          select: {
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    return attendance;
  }

  // ========================================
  // MANAGER ENDPOINTS - Approve/Reject
  // ========================================

  /**
   * Get all pending clock-in requests for my branch
   */
  async getPendingClockIns(branchManagerUserId: string) {
    const branch = await this.getBranchByManager(branchManagerUserId);

    const pendingClockIns = await this.prisma.attendance.findMany({
      where: {
        branchId: branch.id,
        status: AttendanceStatus.PENDING,
      },
      orderBy: { clockInTime: 'desc' },
      include: {
        staff: {
          include: {
            user: { select: { email: true, role: true } },
          },
        },
      },
    });

    return pendingClockIns;
  }

  /**
   * Get all pending clock-out requests for my branch
   */
  async getPendingClockOuts(branchManagerUserId: string) {
    const branch = await this.getBranchByManager(branchManagerUserId);

    const pendingClockOuts = await this.prisma.attendance.findMany({
      where: {
        branchId: branch.id,
        status: AttendanceStatus.CLOCKED_OUT,
      },
      orderBy: { clockOutTime: 'desc' },
      include: {
        staff: {
          include: {
            user: { select: { email: true, role: true } },
          },
        },
      },
    });

    return pendingClockOuts;
  }

  /**
   * Manager approves clock-in
   */
  async approveClockIn(
    branchManagerUserId: string,
    attendanceId: string,
    dto: ApproveClockInDto,
  ) {
    const branch = await this.getBranchByManager(branchManagerUserId);
    const managerStaff = await this.getManagerStaff(branchManagerUserId);

    const attendance = await this.prisma.attendance.findUnique({
      where: { id: attendanceId },
      include: {
        staff: {
          include: {
            user: { select: { email: true } },
          },
        },
      },
    });

    if (!attendance) {
      throw new NotFoundException('Attendance record not found');
    }

    if (attendance.branchId !== branch.id) {
      throw new ForbiddenException(
        'This attendance record belongs to another branch',
      );
    }

    if (attendance.status !== AttendanceStatus.PENDING) {
      throw new BadRequestException('This clock-in has already been processed');
    }

    const updated = await this.prisma.attendance.update({
      where: { id: attendanceId },
      data: {
        status: AttendanceStatus.APPROVED,
        clockInApprovedAt: new Date(),
        clockInApprovedBy: managerStaff?.id || null,
        notes: dto.notes,
      },
      include: {
        staff: {
          include: {
            user: { select: { email: true } },
          },
        },
        clockInApprover: {
          select: {
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    return {
      message: 'Clock-in approved successfully',
      attendance: updated,
    };
  }

  /**
   * Manager rejects clock-in
   */
  async rejectClockIn(
    branchManagerUserId: string,
    attendanceId: string,
    dto: RejectClockInDto,
  ) {
    const branch = await this.getBranchByManager(branchManagerUserId);

    const attendance = await this.prisma.attendance.findUnique({
      where: { id: attendanceId },
      include: {
        staff: {
          include: {
            user: { select: { email: true } },
          },
        },
      },
    });

    if (!attendance) {
      throw new NotFoundException('Attendance record not found');
    }

    if (attendance.branchId !== branch.id) {
      throw new ForbiddenException(
        'This attendance record belongs to another branch',
      );
    }

    if (attendance.status !== AttendanceStatus.PENDING) {
      throw new BadRequestException('This clock-in has already been processed');
    }

    const updated = await this.prisma.attendance.update({
      where: { id: attendanceId },
      data: {
        status: AttendanceStatus.REJECTED,
        rejectionReason: dto.reason,
      },
      include: {
        staff: {
          include: {
            user: { select: { email: true } },
          },
        },
      },
    });

    return {
      message: 'Clock-in rejected',
      attendance: updated,
    };
  }

  /**
   * Manager approves clock-out and calculates hours
   */
  async approveClockOut(
    branchManagerUserId: string,
    attendanceId: string,
    dto: ApproveClockOutDto,
  ) {
    const branch = await this.getBranchByManager(branchManagerUserId);
    const managerStaff = await this.getManagerStaff(branchManagerUserId);

    const attendance = await this.prisma.attendance.findUnique({
      where: { id: attendanceId },
      include: {
        staff: {
          include: {
            user: { select: { email: true } },
          },
        },
      },
    });

    if (!attendance) {
      throw new NotFoundException('Attendance record not found');
    }

    if (attendance.branchId !== branch.id) {
      throw new ForbiddenException(
        'This attendance record belongs to another branch',
      );
    }

    if (attendance.status !== AttendanceStatus.CLOCKED_OUT) {
      throw new BadRequestException(
        'This clock-out has already been processed',
      );
    }

    if (!attendance.clockOutTime) {
      throw new BadRequestException('Clock-out time not recorded');
    }

    // Calculate total hours
    const clockInTime = new Date(attendance.clockInTime);
    const clockOutTime = new Date(attendance.clockOutTime);
    const totalHours =
      (clockOutTime.getTime() - clockInTime.getTime()) / (1000 * 60 * 60);

    const updated = await this.prisma.attendance.update({
      where: { id: attendanceId },
      data: {
        status: AttendanceStatus.COMPLETED,
        clockOutApprovedAt: new Date(),
        clockOutApprovedBy: managerStaff?.id || null,
        totalHours: Math.round(totalHours * 100) / 100, // Round to 2 decimal places
        notes: dto.notes || attendance.notes,
      },
      include: {
        staff: {
          include: {
            user: { select: { email: true } },
          },
        },
        clockInApprover: {
          select: {
            firstName: true,
            lastName: true,
          },
        },
        clockOutApprover: {
          select: {
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    return {
      message: 'Clock-out approved successfully',
      attendance: updated,
    };
  }

  /**
   * Manager rejects clock-out
   */
  async rejectClockOut(
    branchManagerUserId: string,
    attendanceId: string,
    dto: RejectClockOutDto,
  ) {
    const branch = await this.getBranchByManager(branchManagerUserId);

    const attendance = await this.prisma.attendance.findUnique({
      where: { id: attendanceId },
      include: {
        staff: {
          include: {
            user: { select: { email: true } },
          },
        },
      },
    });

    if (!attendance) {
      throw new NotFoundException('Attendance record not found');
    }

    if (attendance.branchId !== branch.id) {
      throw new ForbiddenException(
        'This attendance record belongs to another branch',
      );
    }

    if (attendance.status !== AttendanceStatus.CLOCKED_OUT) {
      throw new BadRequestException(
        'This clock-out has already been processed',
      );
    }

    // Reset clock-out, allow staff to clock out again
    const updated = await this.prisma.attendance.update({
      where: { id: attendanceId },
      data: {
        status: AttendanceStatus.APPROVED, // Back to approved clock-in
        clockOutTime: null,
        clockOutLocation: null,
        rejectionReason: dto.reason,
      },
      include: {
        staff: {
          include: {
            user: { select: { email: true } },
          },
        },
      },
    });

    return {
      message: 'Clock-out rejected. Staff can clock out again.',
      attendance: updated,
    };
  }

  /**
   * Get all attendance records for the branch (with filters)
   */
  async getBranchAttendance(
    branchManagerUserId: string,
    filters?: {
      staffId?: string;
      status?: AttendanceStatus;
      startDate?: Date;
      endDate?: Date;
    },
  ) {
    const branch = await this.getBranchByManager(branchManagerUserId);

    const where: any = { branchId: branch.id };

    if (filters?.staffId) where.staffId = filters.staffId;
    if (filters?.status) where.status = filters.status;
    if (filters?.startDate || filters?.endDate) {
      where.clockInTime = {};
      if (filters.startDate) where.clockInTime.gte = filters.startDate;
      if (filters.endDate) where.clockInTime.lte = filters.endDate;
    }

    const attendances = await this.prisma.attendance.findMany({
      where,
      orderBy: { clockInTime: 'desc' },
      include: {
        staff: {
          include: {
            user: { select: { email: true, role: true } },
          },
        },
        clockInApprover: {
          select: {
            firstName: true,
            lastName: true,
          },
        },
        clockOutApprover: {
          select: {
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    return attendances;
  }

  /**
   * Get attendance summary/stats for the branch
   */
  async getAttendanceSummary(
    branchManagerUserId: string,
    startDate?: Date,
    endDate?: Date,
  ) {
    const branch = await this.getBranchByManager(branchManagerUserId);

    const where: any = { branchId: branch.id };

    if (startDate || endDate) {
      where.clockInTime = {};
      if (startDate) where.clockInTime.gte = startDate;
      if (endDate) where.clockInTime.lte = endDate;
    }

    const [total, pending, approved, completed, rejected] = await Promise.all([
      this.prisma.attendance.count({ where }),
      this.prisma.attendance.count({
        where: { ...where, status: AttendanceStatus.PENDING },
      }),
      this.prisma.attendance.count({
        where: { ...where, status: AttendanceStatus.APPROVED },
      }),
      this.prisma.attendance.count({
        where: { ...where, status: AttendanceStatus.COMPLETED },
      }),
      this.prisma.attendance.count({
        where: { ...where, status: AttendanceStatus.REJECTED },
      }),
    ]);

    const totalHours = await this.prisma.attendance.aggregate({
      where: { ...where, status: AttendanceStatus.COMPLETED },
      _sum: { totalHours: true },
    });

    return {
      total,
      pending,
      approved,
      completed,
      rejected,
      totalHoursWorked: totalHours._sum.totalHours || 0,
    };
  }

  // ========================================
  // HELPER METHODS
  // ========================================

  private async getBranchByManager(branchManagerUserId: string) {
    const branch = await this.prisma.branch.findFirst({
      where: { managerId: branchManagerUserId },
    });

    if (!branch) {
      throw new ForbiddenException(
        'Only branch managers can perform this action',
      );
    }

    return branch;
  }

  private async getManagerStaff(branchManagerUserId: string) {
    // Branch managers might not have a staff record, they're in a different table
    // Return null is fine, we just won't record who approved it
    const staff = await this.prisma.staff.findUnique({
      where: { userId: branchManagerUserId },
    });

    return staff;
  }
}
