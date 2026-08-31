// backend/src/leave/leave.service.ts
//
// Leave request/approval flow:
//   - PHARMACIST / CASHIER / NURSE (Staff) request leave -> approved/rejected
//     by their branch's manager, or by the pharmacy owner.
//   - BRANCH_MANAGER requests leave -> approved/rejected by the pharmacy owner.
//   - PHARMACY (owner) can approve/reject leave for everyone in their pharmacy.
//   - BRANCH_MANAGER can only approve/reject leave for staff in their own branch.
//
// Leave balances (annual leave days, etc.):
//   - PHARMACY (owner) can set balances for anyone in their pharmacy
//     (branch managers and staff alike).
//   - BRANCH_MANAGER can only set balances for staff in their own branch.

import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LeaveStatus, LeaveType, UserRole } from '@prisma/client';
import {
  CreateLeaveRequestDto,
  ApproveLeaveRequestDto,
  RejectLeaveRequestDto,
  SetLeaveBalanceDto,
} from './dto';
import { LEAVE_TYPES, getLeaveTypeInfo } from './leave-type.constants';

const STAFF_ROLES: UserRole[] = [UserRole.PHARMACIST, UserRole.CASHIER, UserRole.NURSE];

interface RequesterContext {
  userId: string;
  role: UserRole;
  branchId: string | null;
  pharmacyId: string;
}

@Injectable()
export class LeaveService {
  constructor(private readonly prisma: PrismaService) {}

  // ========================================
  // Reference data
  // ========================================

  getLeaveTypes() {
    return LEAVE_TYPES;
  }

  // ========================================
  // REQUEST LEAVE (Staff or Branch Manager)
  // ========================================

  async requestLeave(userId: string, dto: CreateLeaveRequestDto) {
    const requester = await this.resolveRequesterContext(userId);

    const startDate = new Date(dto.startDate);
    const endDate = new Date(dto.endDate);

    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      throw new BadRequestException('Invalid start or end date');
    }
    if (endDate < startDate) {
      throw new BadRequestException('endDate cannot be before startDate');
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (startDate < today) {
      throw new BadRequestException('startDate cannot be in the past');
    }

    const totalDays = this.countLeaveDays(dto.leaveType, startDate, endDate);

    // Warn/block only when an explicit balance has been configured for this
    // employee, leave type and year — otherwise there's nothing to check
    // against and we let the request through for the manager/owner to judge.
    const year = startDate.getFullYear();
    const balance = await this.prisma.leaveBalance.findUnique({
      where: {
        userId_year_leaveType: {
          userId,
          year,
          leaveType: dto.leaveType,
        },
      },
    });

    if (balance && balance.usedDays + totalDays > balance.allocatedDays) {
      const remaining = Math.max(0, balance.allocatedDays - balance.usedDays);
      throw new BadRequestException(
        `This request (${totalDays} day(s)) exceeds your remaining ${getLeaveTypeInfo(dto.leaveType).label} balance of ${remaining} day(s) for ${year}.`,
      );
    }

    const overlapping = await this.prisma.leaveRequest.findFirst({
      where: {
        requesterId: userId,
        status: { in: [LeaveStatus.PENDING, LeaveStatus.APPROVED] },
        startDate: { lte: endDate },
        endDate: { gte: startDate },
      },
    });
    if (overlapping) {
      throw new BadRequestException(
        'You already have a pending or approved leave request that overlaps these dates.',
      );
    }

    return this.prisma.leaveRequest.create({
      data: {
        requesterId: userId,
        requesterRole: requester.role,
        branchId: requester.branchId,
        pharmacyId: requester.pharmacyId,
        leaveType: dto.leaveType,
        startDate,
        endDate,
        totalDays,
        reason: dto.reason,
        attachmentUrl: dto.attachmentUrl,
        status: LeaveStatus.PENDING,
      },
      include: this.requestInclude(),
    });
  }

  async getMyLeaveRequests(userId: string) {
    return this.prisma.leaveRequest.findMany({
      where: { requesterId: userId },
      orderBy: { createdAt: 'desc' },
      include: this.requestInclude(),
    });
  }

  async cancelMyLeaveRequest(userId: string, leaveId: string) {
    const leave = await this.prisma.leaveRequest.findUnique({ where: { id: leaveId } });
    if (!leave) throw new NotFoundException('Leave request not found');
    if (leave.requesterId !== userId) {
      throw new ForbiddenException('You can only cancel your own leave requests');
    }
    if (leave.status !== LeaveStatus.PENDING) {
      throw new BadRequestException('Only pending leave requests can be cancelled');
    }

    return this.prisma.leaveRequest.update({
      where: { id: leaveId },
      data: { status: LeaveStatus.CANCELLED },
      include: this.requestInclude(),
    });
  }

  async getMyLeaveBalances(userId: string, year?: number) {
    const targetYear = year ?? new Date().getFullYear();
    const balances = await this.prisma.leaveBalance.findMany({
      where: { userId, year: targetYear },
    });

    // Merge with statutory defaults so the UI always has a full picture,
    // even for leave types the manager/owner hasn't explicitly configured.
    return LEAVE_TYPES.map((info) => {
      const override = balances.find((b) => b.leaveType === info.type);
      return {
        leaveType: info.type,
        label: info.label,
        year: targetYear,
        allocatedDays: override?.allocatedDays ?? info.defaultDays,
        usedDays: override?.usedDays ?? 0,
        remainingDays: (override?.allocatedDays ?? info.defaultDays) - (override?.usedDays ?? 0),
        isCustom: !!override,
      };
    });
  }

  // ========================================
  // BRANCH MANAGER: review leave for own branch staff
  // ========================================

  async getBranchLeaveRequests(managerUserId: string, status?: LeaveStatus) {
    const branch = await this.getBranchByManager(managerUserId);
    return this.prisma.leaveRequest.findMany({
      where: {
        branchId: branch.id,
        requesterRole: { in: STAFF_ROLES },
        ...(status ? { status } : {}),
      },
      orderBy: { createdAt: 'desc' },
      include: this.requestInclude(),
    });
  }

  async setBranchStaffLeaveBalance(managerUserId: string, dto: SetLeaveBalanceDto) {
    const branch = await this.getBranchByManager(managerUserId);

    const targetStaff = await this.prisma.staff.findUnique({
      where: { userId: dto.userId },
    });
    if (!targetStaff || targetStaff.branchId !== branch.id) {
      throw new ForbiddenException(
        'You can only set leave balances for staff you manage in your own branch.',
      );
    }

    return this.upsertLeaveBalance(managerUserId, dto);
  }

  async getBranchLeaveBalances(managerUserId: string, year?: number) {
    const branch = await this.getBranchByManager(managerUserId);
    const targetYear = year ?? new Date().getFullYear();

    const staffList = await this.prisma.staff.findMany({
      where: { branchId: branch.id },
      include: {
        user: { select: { id: true, email: true, role: true } },
      },
    });

    const results = [];
    for (const staff of staffList) {
      const balances = await this.getMyLeaveBalances(staff.userId, targetYear);
      results.push({
        userId: staff.userId,
        staffId: staff.id,
        name: `${staff.firstName} ${staff.lastName}`,
        role: staff.user.role,
        balances,
      });
    }
    return results;
  }

  // ========================================
  // PHARMACY OWNER: review leave for anyone in the pharmacy
  // (staff across all branches + branch managers themselves)
  // ========================================

  async getPharmacyLeaveRequests(
    ownerUserId: string,
    filters: { status?: LeaveStatus; branchId?: string } = {},
  ) {
    const pharmacy = await this.getPharmacyByOwner(ownerUserId);
    return this.prisma.leaveRequest.findMany({
      where: {
        pharmacyId: pharmacy.id,
        ...(filters.status ? { status: filters.status } : {}),
        ...(filters.branchId ? { branchId: filters.branchId } : {}),
      },
      orderBy: { createdAt: 'desc' },
      include: this.requestInclude(),
    });
  }

  async setPharmacyLeaveBalance(ownerUserId: string, dto: SetLeaveBalanceDto) {
    const pharmacy = await this.getPharmacyByOwner(ownerUserId);

    // Target can be a staff member (any branch of this pharmacy) or a
    // branch manager of this pharmacy.
    const targetStaff = await this.prisma.staff.findUnique({
      where: { userId: dto.userId },
      include: { branch: true },
    });
    const targetManagerBranch = await this.prisma.branch.findFirst({
      where: { managerId: dto.userId },
    });

    const belongsToPharmacy =
      (targetStaff && targetStaff.branch.pharmacyId === pharmacy.id) ||
      (targetManagerBranch && targetManagerBranch.pharmacyId === pharmacy.id);

    if (!belongsToPharmacy) {
      throw new ForbiddenException(
        'This employee does not belong to a branch of your pharmacy.',
      );
    }

    return this.upsertLeaveBalance(ownerUserId, dto);
  }

  async getPharmacyLeaveBalances(ownerUserId: string, year?: number) {
    const pharmacy = await this.getPharmacyByOwner(ownerUserId);
    const targetYear = year ?? new Date().getFullYear();

    const [staffList, managerBranches] = await Promise.all([
      this.prisma.staff.findMany({
        where: { branch: { pharmacyId: pharmacy.id } },
        include: { user: { select: { id: true, role: true } }, branch: { select: { name: true } } },
      }),
      this.prisma.branch.findMany({
        where: { pharmacyId: pharmacy.id, managerId: { not: null } },
        include: { manager: { select: { id: true, email: true, role: true } } },
      }),
    ]);

    const results = [];
    for (const staff of staffList) {
      const balances = await this.getMyLeaveBalances(staff.userId, targetYear);
      results.push({
        userId: staff.userId,
        staffId: staff.id,
        name: `${staff.firstName} ${staff.lastName}`,
        role: staff.user.role,
        branchName: staff.branch.name,
        balances,
      });
    }
    for (const branch of managerBranches) {
      if (!branch.manager) continue;
      const balances = await this.getMyLeaveBalances(branch.manager.id, targetYear);
      results.push({
        userId: branch.manager.id,
        staffId: null,
        name: branch.branchManagerName || branch.manager.email,
        role: branch.manager.role,
        branchName: branch.name,
        balances,
      });
    }
    return results;
  }

  // ========================================
  // APPROVE / REJECT (shared entry point — the caller's role/branch
  // determines what they're allowed to touch)
  // ========================================

  async approveLeaveRequest(reviewerUserId: string, leaveId: string, dto: ApproveLeaveRequestDto) {
    const { leave } = await this.assertCanReview(reviewerUserId, leaveId);

    const updated = await this.prisma.$transaction(async (tx) => {
      const record = await tx.leaveRequest.update({
        where: { id: leaveId },
        data: {
          status: LeaveStatus.APPROVED,
          reviewerId: reviewerUserId,
          reviewedAt: new Date(),
          rejectionReason: null,
        },
        include: this.requestInclude(),
      });

      const year = record.startDate.getFullYear();
      await tx.leaveBalance.upsert({
        where: {
          userId_year_leaveType: {
            userId: record.requesterId,
            year,
            leaveType: record.leaveType,
          },
        },
        update: { usedDays: { increment: record.totalDays } },
        create: {
          userId: record.requesterId,
          year,
          leaveType: record.leaveType,
          allocatedDays: getLeaveTypeInfo(record.leaveType).defaultDays,
          usedDays: record.totalDays,
          setById: reviewerUserId,
        },
      });

      return record;
    });

    void dto; // note is accepted for future notification/audit use
    return updated;
  }

  async rejectLeaveRequest(reviewerUserId: string, leaveId: string, dto: RejectLeaveRequestDto) {
    await this.assertCanReview(reviewerUserId, leaveId);

    return this.prisma.leaveRequest.update({
      where: { id: leaveId },
      data: {
        status: LeaveStatus.REJECTED,
        reviewerId: reviewerUserId,
        reviewedAt: new Date(),
        rejectionReason: dto.rejectionReason,
      },
      include: this.requestInclude(),
    });
  }

  // ========================================
  // Internal helpers
  // ========================================

  private requestInclude() {
    return {
      requester: {
        select: {
          id: true,
          email: true,
          role: true,
          staff: { select: { firstName: true, lastName: true, branchId: true } },
          managedBranch: { select: { id: true, name: true, branchManagerName: true } },
        },
      },
      reviewer: { select: { id: true, email: true, role: true } },
      branch: { select: { id: true, name: true } },
    };
  }

  private async resolveRequesterContext(userId: string): Promise<RequesterContext> {
    const staff = await this.prisma.staff.findUnique({
      where: { userId },
      include: { branch: true, user: { select: { role: true } } },
    });
    if (staff) {
      return {
        userId,
        role: staff.user.role,
        branchId: staff.branchId,
        pharmacyId: staff.branch.pharmacyId,
      };
    }

    const branch = await this.prisma.branch.findFirst({ where: { managerId: userId } });
    if (branch) {
      return {
        userId,
        role: UserRole.BRANCH_MANAGER,
        branchId: branch.id,
        pharmacyId: branch.pharmacyId,
      };
    }

    throw new ForbiddenException(
      'Only pharmacists, cashiers, nurses and branch managers can request leave.',
    );
  }

  private async assertCanReview(reviewerUserId: string, leaveId: string) {
    const leave = await this.prisma.leaveRequest.findUnique({ where: { id: leaveId } });
    if (!leave) throw new NotFoundException('Leave request not found');
    if (leave.status !== LeaveStatus.PENDING) {
      throw new BadRequestException('Only pending leave requests can be reviewed');
    }

    // Pharmacy owner can review anyone in their pharmacy.
    const pharmacy = await this.prisma.pharmacy.findUnique({ where: { userId: reviewerUserId } });
    if (pharmacy) {
      if (pharmacy.id !== leave.pharmacyId) {
        throw new ForbiddenException('This leave request does not belong to your pharmacy.');
      }
      return { leave, pharmacy };
    }

    // Branch manager can only review their own branch's staff — never
    // another manager's leave, which only the owner can approve.
    const branch = await this.prisma.branch.findFirst({ where: { managerId: reviewerUserId } });
    if (branch) {
      if (leave.requesterRole === UserRole.BRANCH_MANAGER) {
        throw new ForbiddenException(
          'Branch manager leave requests can only be approved by the pharmacy owner.',
        );
      }
      if (leave.branchId !== branch.id) {
        throw new ForbiddenException('You can only review leave requests from your own branch.');
      }
      return { leave, branch };
    }

    throw new ForbiddenException('You are not authorized to review this leave request.');
  }

  private async upsertLeaveBalance(setterUserId: string, dto: SetLeaveBalanceDto) {
    const leaveType = dto.leaveType ?? LeaveType.ANNUAL;
    return this.prisma.leaveBalance.upsert({
      where: {
        userId_year_leaveType: {
          userId: dto.userId,
          year: dto.year,
          leaveType,
        },
      },
      update: {
        allocatedDays: dto.allocatedDays,
        notes: dto.notes,
        setById: setterUserId,
      },
      create: {
        userId: dto.userId,
        year: dto.year,
        leaveType,
        allocatedDays: dto.allocatedDays,
        notes: dto.notes,
        setById: setterUserId,
      },
    });
  }

  private async getBranchByManager(managerUserId: string) {
    const branch = await this.prisma.branch.findFirst({ where: { managerId: managerUserId } });
    if (!branch) {
      throw new ForbiddenException('Only branch managers can perform this action');
    }
    return branch;
  }

  private async getPharmacyByOwner(ownerUserId: string) {
    const pharmacy = await this.prisma.pharmacy.findUnique({ where: { userId: ownerUserId } });
    if (!pharmacy) {
      throw new ForbiddenException('Only the pharmacy owner can perform this action');
    }
    return pharmacy;
  }

  /**
   * Maternity leave runs as 12 continuous weeks (including weekends), so it
   * is counted in calendar days. Every other leave type is counted in
   * Mon-Fri working days, consistent with how the law expresses them.
   */
  private countLeaveDays(leaveType: LeaveType, start: Date, end: Date): number {
    const cursor = new Date(start);
    cursor.setHours(0, 0, 0, 0);
    const last = new Date(end);
    last.setHours(0, 0, 0, 0);

    if (leaveType === LeaveType.MATERNITY) {
      const msPerDay = 24 * 60 * 60 * 1000;
      return Math.round((last.getTime() - cursor.getTime()) / msPerDay) + 1;
    }

    let count = 0;
    while (cursor <= last) {
      const day = cursor.getDay();
      if (day !== 0 && day !== 6) count++;
      cursor.setDate(cursor.getDate() + 1);
    }
    return count;
  }
}
