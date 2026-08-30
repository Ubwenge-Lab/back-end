import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateStockTransferDto, UpdateStockTransferStatusDto } from './dto';

type TransferStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'SHIPPED' | 'COMPLETED' | 'CANCELLED';

@Injectable()
export class StockTransfersService {
  constructor(private readonly prisma: PrismaService) {}

  async getBranchTransfers(managerUserId: string) {
    const branch = await this.prisma.branch.findUnique({
      where: { managerId: managerUserId },
    });

    if (!branch) {
      throw new ForbiddenException('Only branch managers can access transfers');
    }

    return this.prisma.stockTransfer.findMany({
      where: {
        OR: [{ fromBranchId: branch.id }, { toBranchId: branch.id }],
      },
      include: {
        fromBranch: { select: { id: true, name: true, address: true } },
        toBranch: { select: { id: true, name: true, address: true } },
        items: {
          include: {
            medication: {
              select: {
                id: true,
                name: true,
                chemicalName: true,
                quantity: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createTransfer(managerUserId: string, dto: CreateStockTransferDto) {
    const fromBranch = await this.prisma.branch.findUnique({
      where: { managerId: managerUserId },
    });

    if (!fromBranch) {
      throw new ForbiddenException(
        'Only branch managers can initiate stock transfers',
      );
    }

    if (fromBranch.id === dto.toBranchId) {
      throw new BadRequestException('Cannot transfer stock to the same branch');
    }

    const toBranch = await this.prisma.branch.findUnique({
      where: { id: dto.toBranchId },
    });

    if (!toBranch || toBranch.pharmacyId !== fromBranch.pharmacyId) {
      throw new BadRequestException('Invalid destination branch');
    }

    // Validate stock availability atomically with creation. NOTE: no stock is
    // moved here — the sender's quantity is only deducted at SHIPPED (see
    // updateTransferStatus). This is the fix for "stock vanishes while a
    // transfer is still pending".
    return this.prisma.$transaction(async (tx) => {
      for (const item of dto.items) {
        const medication = await tx.medication.findUnique({
          where: { id: item.medicationId },
        });

        if (!medication || medication.branchId !== fromBranch.id) {
          throw new BadRequestException(
            `Medication ${item.medicationId} not found in your branch inventory`,
          );
        }

        if (medication.quantity < item.quantity) {
          throw new BadRequestException(
            `Insufficient stock for medication: ${medication.name}. Available: ${medication.quantity}, Requested: ${item.quantity}`,
          );
        }
      }

      return tx.stockTransfer.create({
        data: {
          fromBranchId: fromBranch.id,
          toBranchId: dto.toBranchId,
          notes: dto.notes,
          status: 'PENDING',
          items: {
            create: dto.items.map((item) => ({
              medicationId: item.medicationId,
              quantity: item.quantity,
            })),
          },
        },
        include: {
          items: true,
        },
      });
    });
  }

  async updateTransferStatus(
    managerUserId: string,
    transferId: string,
    dto: UpdateStockTransferStatusDto,
  ) {
    const branch = await this.prisma.branch.findUnique({
      where: { managerId: managerUserId },
    });

    if (!branch) {
      throw new ForbiddenException(
        'Only branch managers can process transfers',
      );
    }

    const transfer = await this.prisma.stockTransfer.findUnique({
      where: { id: transferId },
      include: { items: true },
    });

    if (!transfer) {
      throw new NotFoundException('Stock transfer not found');
    }

    const isSender = transfer.fromBranchId === branch.id;
    const isReceiver = transfer.toBranchId === branch.id;

    if (!isSender && !isReceiver) {
      throw new ForbiddenException(
        'You are not authorized to update this transfer',
      );
    }

    const from = transfer.status as TransferStatus;
    const next = dto.status as TransferStatus;

    // Valid transitions per side:
    //   PENDING:  receiver -> APPROVED | REJECTED ; sender -> CANCELLED
    //   APPROVED: sender   -> SHIPPED | CANCELLED ; receiver -> REJECTED
    //   SHIPPED:  receiver -> COMPLETED
    const allowed: Record<TransferStatus, TransferStatus[]> = {
      PENDING: isReceiver ? ['APPROVED', 'REJECTED'] : isSender ? ['CANCELLED'] : [],
      APPROVED: isSender ? ['SHIPPED', 'CANCELLED'] : isReceiver ? ['REJECTED'] : [],
      SHIPPED: isReceiver ? ['COMPLETED'] : [],
      COMPLETED: [],
      REJECTED: [],
      CANCELLED: [],
    };

    const terminalStates: TransferStatus[] = ['COMPLETED', 'REJECTED', 'CANCELLED'];
    if (terminalStates.includes(from)) {
      throw new BadRequestException(
        `Cannot update a transfer that is already ${from}`,
      );
    }

    if (!allowed[from].includes(next)) {
      throw new BadRequestException(
        `Invalid transition ${from} → ${next} for this branch`,
      );
    }

    // REJECT / CANCEL: restore the sender's stock only if it was actually
    // deducted (SHIPPED happened, or the row predates the stock-timing fix).
    if (next === 'REJECTED' || next === 'CANCELLED') {
      await this.prisma.$transaction(async (tx) => {
        if (transfer.stockDeducted) {
          for (const item of transfer.items) {
            await tx.medication.update({
              where: { id: item.medicationId },
              data: { quantity: { increment: item.quantity } },
            });
          }
        }
        await tx.stockTransfer.update({
          where: { id: transferId },
          data: { status: next },
        });
      });
      return {
        message:
          next === 'REJECTED'
            ? 'Transfer rejected and stock restored'
            : 'Transfer cancelled',
      };
    }

    // SHIPPED: deduct the sender's stock now (atomic re-check + decrement).
    if (next === 'SHIPPED') {
      await this.prisma.$transaction(async (tx) => {
        for (const item of transfer.items) {
          const med = await tx.medication.findUnique({
            where: { id: item.medicationId },
          });
          if (!med || med.branchId !== transfer.fromBranchId) {
            throw new BadRequestException(
              `Medication ${item.medicationId} no longer exists in the sending branch`,
            );
          }
          if (med.quantity < item.quantity) {
            throw new BadRequestException(
              `Insufficient stock to ship: ${med.name}. Available: ${med.quantity}, Requested: ${item.quantity}`,
            );
          }
        }
        for (const item of transfer.items) {
          await tx.medication.update({
            where: { id: item.medicationId },
            data: { quantity: { decrement: item.quantity } },
          });
        }
        await tx.stockTransfer.update({
          where: { id: transferId },
          data: { status: 'SHIPPED', stockDeducted: true },
        });
      });
      return { message: 'Transfer shipped and sender stock deducted' };
    }

    // COMPLETED: add the stock to the receiving branch (create a local
    // medication row if the branch doesn't carry this item yet).
    if (next === 'COMPLETED') {
      await this.prisma.$transaction(async (tx) => {
        for (const item of transfer.items) {
          const sendingMed = await tx.medication.findUnique({
            where: { id: item.medicationId },
          });

          if (!sendingMed) {
            throw new BadRequestException(
              `Medication ID ${item.medicationId} not found`,
            );
          }

          const destMed = await tx.medication.findFirst({
            where: {
              branchId: transfer.toBranchId,
              name: sendingMed.name,
              chemicalName: sendingMed.chemicalName,
            },
          });

          if (destMed) {
            await tx.medication.update({
              where: { id: destMed.id },
              data: { quantity: { increment: item.quantity } },
            });
          } else {
            await tx.medication.create({
              data: {
                name: sendingMed.name,
                chemicalName: sendingMed.chemicalName,
                description: sendingMed.description,
                category: sendingMed.category,
                price: sendingMed.price,
                lowStockThreshold: sendingMed.lowStockThreshold,
                requiresPrescription: sendingMed.requiresPrescription,
                imageUrl: sendingMed.imageUrl,
                pharmacyId: sendingMed.pharmacyId,
                registryId: sendingMed.registryId,
                branchId: transfer.toBranchId,
                quantity: item.quantity,
              },
            });
          }
        }

        await tx.stockTransfer.update({
          where: { id: transferId },
          data: { status: 'COMPLETED' },
        });
      });

      return { message: 'Transfer completed and inventory updated' };
    }

    // APPROVED (and any other valid transition) — no stock movement here.
    return this.prisma.stockTransfer.update({
      where: { id: transferId },
      data: { status: next },
    });
  }
}
