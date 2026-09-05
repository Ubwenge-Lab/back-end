import { StaffLeaveService } from './staff-leave.service';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';

const staff = { id: 'staff-1', userId: 'user-1', branchId: 'branch-A', firstName: 'Ana', lastName: 'N' };
const branch = { id: 'branch-A', managerId: 'user-M' };

function makePrisma(store: any) {
  return {
    staffLeave: {
      create: jest.fn(async ({ data }: any) => ({ id: 'leave-1', ...data })),
      findMany: jest.fn(async () => store.leaves ?? []),
      findUnique: jest.fn(async ({ where }: any) => store.leave ?? null),
      update: jest.fn(async ({ where, data }: any) => ({ id: where.id, ...data })),
    },
    branch: {
      findUnique: jest.fn(async ({ where }: any) =>
        where.managerId === 'user-M' ? branch : null,
      ),
    },
    $transaction: jest.fn(async (fn: any) => (typeof fn === 'function' ? fn(store.prisma) : null)),
  };
}

const staffService = {
  findByUserId: jest.fn(async () => staff),
};

const auditService = {
  log: jest.fn(async () => undefined),
};

const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
const inFiveDays = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
const dto = { type: 'ANNUAL' as const, startDate: tomorrow, endDate: inFiveDays, reason: 'Family trip' };

describe('StaffLeaveService', () => {
  const build = (store: any = {}) => {
    const prisma = makePrisma(store);
    store.prisma = prisma;
    return { service: new StaffLeaveService(prisma as any, staffService as any, auditService as any), prisma };
  };

  it('staff can request leave; audit written', async () => {
    const { service, prisma } = build();
    const leave = await service.requestLeave('user-1', dto);
    expect(prisma.staffLeave.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ staffId: 'staff-1', branchId: 'branch-A' }),
      }),
    );
    expect(leave.id).toBe('leave-1');
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'LEAVE_REQUEST', targetId: 'leave-1' }),
    );
  });

  it('rejects end date before start date', async () => {
    const { service } = build();
    await expect(
      service.requestLeave('user-1', { ...dto, endDate: '2026-08-20' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects leave starting in the past', async () => {
    const { service } = build();
    await expect(
      service.requestLeave('user-1', { ...dto, startDate: '2020-01-01' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('non-staff users cannot request leave', async () => {
    staffService.findByUserId.mockResolvedValueOnce(null);
    const { service } = build();
    await expect(service.requestLeave('user-X', dto)).rejects.toThrow(ForbiddenException);
  });

  it('staff sees only their own requests', async () => {
    const { service, prisma } = build();
    await service.listMyLeaves('user-1');
    expect(prisma.staffLeave.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { staffId: 'staff-1' } }),
    );
  });

  it('manager can approve a PENDING request', async () => {
    const { service, prisma } = build({ leave: { id: 'leave-1', branchId: 'branch-A', status: 'PENDING', staffId: 'staff-1' } });
    const updated = await service.updateLeaveStatus('user-M', 'leave-1', { status: 'APPROVED', reviewNote: 'OK' });
    expect(prisma.staffLeave.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'APPROVED', reviewedAt: expect.any(Date) }),
      }),
    );
    expect(updated.status).toBe('APPROVED');
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'LEAVE_APPROVED' }),
    );
  });

  it('cannot review a leave from another branch', async () => {
    const { service } = build({ leave: { id: 'leave-1', branchId: 'branch-Z', status: 'PENDING' } });
    await expect(
      service.updateLeaveStatus('user-M', 'leave-1', { status: 'APPROVED' }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('cannot re-review a non-PENDING request', async () => {
    const { service } = build({ leave: { id: 'leave-1', branchId: 'branch-A', status: 'APPROVED' } });
    await expect(
      service.updateLeaveStatus('user-M', 'leave-1', { status: 'REJECTED' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('unknown leave request throws NotFound', async () => {
    const { service } = build();
    await expect(
      service.updateLeaveStatus('user-M', 'nope', { status: 'APPROVED' }),
    ).rejects.toThrow(NotFoundException);
  });
});
