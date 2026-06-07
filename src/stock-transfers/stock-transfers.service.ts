import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateStockTransferDto, UpdateStockTransferStatusDto } from './dto';

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

    // Wrap stock validation + transfer creation in a transaction so that the
    // quantity check and the record creation are atomic. Without this, two
    // concurrent transfer requests could both pass the stock check and both
    // be created even when only one had enough stock.
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


      for (const item of dto.items) {
        await tx.medication.update({
          where: { id: item.medicationId },
          data: { quantity: { decrement: item.quantity } },
        });
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

    if (transfer.status === 'COMPLETED' || transfer.status === 'REJECTED') {
      throw new BadRequestException(
        `Cannot update a transfer that is already ${transfer.status}`,
      );
    }

    if (dto.status === 'REJECTED') {
      await this.prisma.$transaction(async (tx) => {
        for (const item of transfer.items) {
          await tx.medication.update({
            where: { id: item.medicationId },
            data: { quantity: { increment: item.quantity } },
          });
        }
        await tx.stockTransfer.update({
          where: { id: transferId },
          data: { status: 'REJECTED' },
        });
      });
      return { message: 'Transfer rejected and stock restored' };
    }

    if (dto.status === 'COMPLETED') {
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

    return this.prisma.stockTransfer.update({
      where: { id: transferId },
      data: { status: dto.status },
    });
  }
}
