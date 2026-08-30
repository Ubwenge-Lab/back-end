import { Test } from '@nestjs/testing';
import { StockTransfersService } from './stock-transfers.service';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';

const branchA = { id: 'branch-A', pharmacyId: 'pharm-1' };
const branchB = { id: 'branch-B', pharmacyId: 'pharm-1' };

const med = (id: string, qty: number, branchId = 'branch-A') => ({
  id,
  name: `Med ${id}`,
  chemicalName: 'chem',
  description: 'desc',
  category: 'analgesic',
  price: 100,
  lowStockThreshold: 5,
  requiresPrescription: false,
  imageUrl: null,
  pharmacyId: 'pharm-1',
  registryId: null,
  branchId,
  quantity: qty,
});

function makePrisma(overrides: any = {}) {
  const store: any = { ...overrides };
  return {
    branch: {
      findUnique: jest.fn(async ({ where }: any) => {
        if (where.managerId === 'user-A' || where.id === 'branch-A') return branchA;
        if (where.managerId === 'user-B' || where.id === 'branch-B') return branchB;
        return store.branch ?? null;
      }),
    },
    medication: {
      findUnique: jest.fn(async ({ where }: any) => store.meds?.[where.id] ?? null),
      findFirst: jest.fn(async () => store.destMed ?? null),
      update: jest.fn(async ({ where, data }: any) => {
        const m = store.meds[where.id];
        if (data.quantity?.decrement != null) m.quantity -= data.quantity.decrement;
        else if (data.quantity?.increment != null) m.quantity += data.quantity.increment;
        return m;
      }),
      create: jest.fn(async ({ data }: any) => ({ id: 'new-med', ...data })),
    },
    stockTransfer: {
      findUnique: jest.fn(async ({ where }: any) => store.transfer ?? null),
      findMany: jest.fn(async () => []),
      create: jest.fn(async ({ data, include }: any) => ({ id: 't1', ...data, items: [] })),
      update: jest.fn(async ({ where, data }: any) => ({ id: where.id, ...data })),
    },
    $transaction: jest.fn(async (fn: any) => {
      if (typeof fn === 'function') return fn(store.prisma);
      return null;
    }),
  };
}

describe('StockTransfersService', () => {
  const build = (store: any) => {
    const prisma = makePrisma(store);
    // wire the tx so the callback receives the same fake client
    prisma.$transaction.mockImplementation(async (fn: any) => fn(prisma));
    store.prisma = prisma;
    return { service: new StockTransfersService(prisma as any), prisma };
  };

  const transfer = (status: string, stockDeducted = false) => ({
    id: 't1',
    fromBranchId: 'branch-A',
    toBranchId: 'branch-B',
    status,
    stockDeducted,
    items: [{ id: 'i1', medicationId: 'm1', quantity: 5 }],
  });

  it('createTransfer validates stock and does NOT deduct at creation', async () => {
    const { service: s, prisma } = build({ meds: { m1: med('m1', 10) } });
    await s.createTransfer('user-A', { toBranchId: 'branch-B', items: [{ medicationId: 'm1', quantity: 5 }] });
    expect(prisma.medication.update).not.toHaveBeenCalled();
    expect(prisma.stockTransfer.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'PENDING', fromBranchId: 'branch-A' }),
      }),
    );
  });

  it('createTransfer rejects insufficient stock', async () => {
    const { service: s } = build({ meds: { m1: med('m1', 3) } });
    await expect(
      s.createTransfer('user-A', { toBranchId: 'branch-B', items: [{ medicationId: 'm1', quantity: 5 }] }),
    ).rejects.toThrow(BadRequestException);
  });

  it('createTransfer rejects same-branch transfers', async () => {
    const { service: s } = build({ meds: { m1: med('m1', 10) } });
    await expect(
      s.createTransfer('user-A', { toBranchId: 'branch-A', items: [{ medicationId: 'm1', quantity: 1 }] }),
    ).rejects.toThrow(BadRequestException);
  });

  it('receiver can APPROVE a PENDING transfer without touching stock', async () => {
    const { service: s, prisma } = build({ meds: { m1: med('m1', 10) }, transfer: transfer('PENDING') });
    await s.updateTransferStatus('user-B', 't1', { status: 'APPROVED' });
    expect(prisma.medication.update).not.toHaveBeenCalled();
    expect(prisma.stockTransfer.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'APPROVED' }) }),
    );
  });

  it('sender CANCELS a PENDING transfer (no restore needed — never deducted)', async () => {
    const { service: s, prisma } = build({ meds: { m1: med('m1', 10) }, transfer: transfer('PENDING') });
    const res = (await s.updateTransferStatus('user-A', 't1', { status: 'CANCELLED' })) as { message: string };
    expect(res.message).toContain('cancelled');
    expect(prisma.medication.update).not.toHaveBeenCalled();
  });

  it('sender cannot APPROVE their own pending transfer', async () => {
    const { service: s } = build({ meds: { m1: med('m1', 10) }, transfer: transfer('PENDING') });
    await expect(s.updateTransferStatus('user-A', 't1', { status: 'APPROVED' })).rejects.toThrow(BadRequestException);
  });

  it('SHIPPED deducts sender stock and marks stockDeducted', async () => {
    const { service: s, prisma } = build({ meds: { m1: med('m1', 10) }, transfer: transfer('APPROVED') });
    await s.updateTransferStatus('user-A', 't1', { status: 'SHIPPED' });
    expect(prisma.medication.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ quantity: { decrement: 5 } }) }),
    );
    expect(prisma.stockTransfer.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'SHIPPED', stockDeducted: true }) }),
    );
  });

  it('SHIPPED fails atomically when stock was sold in the meantime', async () => {
    const { service: s, prisma } = build({ meds: { m1: med('m1', 2) }, transfer: transfer('APPROVED') });
    await expect(s.updateTransferStatus('user-A', 't1', { status: 'SHIPPED' })).rejects.toThrow(BadRequestException);
    expect(prisma.medication.update).not.toHaveBeenCalled();
  });

  it('REJECTED restores sender stock only when it was deducted', async () => {
    const { service: s, prisma } = build({ meds: { m1: med('m1', 10) }, transfer: transfer('PENDING', true) });
    await s.updateTransferStatus('user-B', 't1', { status: 'REJECTED' });
    expect(prisma.medication.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ quantity: { increment: 5 } }) }),
    );
  });

  it('COMPLETED adds stock to the receiving branch', async () => {
    const { service: s, prisma } = build({
      meds: { m1: med('m1', 10) },
      destMed: med('m1', 20, 'branch-B'),
      transfer: transfer('SHIPPED', true),
    });
    await s.updateTransferStatus('user-B', 't1', { status: 'COMPLETED' });
    expect(prisma.medication.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ quantity: { increment: 5 } }) }),
    );
    expect(prisma.stockTransfer.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'COMPLETED' }) }),
    );
  });

  it('terminal states cannot be re-transitioned', async () => {
    const { service: s } = build({ meds: { m1: med('m1', 10) }, transfer: transfer('COMPLETED') });
    await expect(s.updateTransferStatus('user-B', 't1', { status: 'SHIPPED' })).rejects.toThrow(BadRequestException);
  });

  it('non-branch users cannot act on a transfer', async () => {
    const { service: s } = build({ meds: { m1: med('m1', 10) }, transfer: transfer('PENDING') });
    await expect(s.updateTransferStatus('user-A', 't1', { status: 'REJECTED' })).rejects.toThrow(BadRequestException);
  });

  it('unknown transfer throws NotFound', async () => {
    const { service: s } = build({ meds: { m1: med('m1', 10) } });
    await expect(s.updateTransferStatus('user-A', 'nope', { status: 'APPROVED' })).rejects.toThrow(NotFoundException);
  });
});
