import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StaffService } from '../staff/staff.service';
import { AuditService } from '../audit/audit.service';
import { CreateStaffLeaveDto } from './dto/create-staff-leave.dto';
import { UpdateStaffLeaveStatusDto } from './dto/update-staff-leave-status.dto';

@Injectable()
export class StaffLeaveService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly staffService: StaffService,
    private readonly auditService: AuditService,
  ) {}

  /** Staff (PHARMACIST/CASHIER/NURSE) requests leave for their branch. */
  async requestLeave(staffUserId: string, dto: CreateStaffLeaveDto) {
    const staff = await this.staffService.findByUserId(staffUserId);
    if (!staff) {
      throw new ForbiddenException('Only pharmacy staff can request leave');
    }

    const start = new Date(dto.startDate);
    const end = new Date(dto.endDate);

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      throw new BadRequestException('Invalid leave dates');
    }
    if (end < start) {
      throw new BadRequestException('End date must be on or after the start date');
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (start < today) {
      throw new BadRequestException('Leave cannot start in the past');
    }

    const leave = await this.prisma.staffLeave.create({
      data: {
        staffId: staff.id,
        branchId: staff.branchId,
        type: dto.type,
        startDate: start,
        endDate: end,
        reason: dto.reason,
      },
    });

    this.auditService
      .log({
        actorId: staff.id,
        actorRole: 'STAFF',
        action: 'LEAVE_REQUEST',
        targetType: 'StaffLeave',
        targetId: leave.id,
        outcome: 'SUCCESS',
      })
      .catch(() => undefined);

    return leave;
  }

  /** Staff sees their own requests. */
  async listMyLeaves(staffUserId: string) {
    const staff = await this.staffService.findByUserId(staffUserId);
    if (!staff) {
      throw new ForbiddenException('Only pharmacy staff can view leave');
    }
    return this.prisma.staffLeave.findMany({
      where: { staffId: staff.id },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Branch manager sees all requests for their branch (PENDING first). */
  async listBranchLeaves(managerUserId: string) {
    const branch = await this.prisma.branch.findUnique({
      where: { managerId: managerUserId },
    });
    if (!branch) {
      throw new ForbiddenException('Only branch managers can review leave');
    }
    return this.prisma.staffLeave.findMany({
      where: { branchId: branch.id },
      include: {
        staff: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    });
  }

  /** Manager approves/rejects a PENDING request. */
  async updateLeaveStatus(
    managerUserId: string,
    leaveId: string,
    dto: UpdateStaffLeaveStatusDto,
  ) {
    const branch = await this.prisma.branch.findUnique({
      where: { managerId: managerUserId },
    });
    if (!branch) {
      throw new ForbiddenException('Only branch managers can review leave');
    }

    const leave = await this.prisma.staffLeave.findUnique({
      where: { id: leaveId },
    });
    if (!leave) {
      throw new NotFoundException('Leave request not found');
    }
    if (leave.branchId !== branch.id) {
      throw new ForbiddenException(
        'Leave request does not belong to your branch',
      );
    }
    if (leave.status !== 'PENDING') {
      throw new BadRequestException(
        `Cannot update a leave request that is already ${leave.status}`,
      );
    }

    const updated = await this.prisma.staffLeave.update({
      where: { id: leaveId },
      data: {
        status: dto.status,
        reviewedBy: leave.staffId,
        reviewNote: dto.reviewNote,
        reviewedAt: new Date(),
      },
    });

    this.auditService
      .log({
        actorId: managerUserId,
        actorRole: 'BRANCH_MANAGER',
        action:
          dto.status === 'APPROVED' ? 'LEAVE_APPROVED' : 'LEAVE_REJECTED',
        targetType: 'StaffLeave',
        targetId: leaveId,
        outcome: 'SUCCESS',
        metadata: { reviewNote: dto.reviewNote },
      })
      .catch(() => undefined);

    return updated;
  }
}
