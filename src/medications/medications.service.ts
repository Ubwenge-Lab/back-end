// backend/src/medications/medications.service.ts

import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { PharmaciesService } from '../pharmacies/pharmacies.service';
import { NotificationsService } from '../notifications/notifications.service';
import { StaffService } from '../staff/staff.service';
import {
  CreateMedicationDto,
  UpdateMedicationDto,
  SearchMedicationsDto,
  BulkCreateMedicationDto,
} from './dto';

@Injectable()
export class MedicationsService {
  constructor(
    private prisma: PrismaService,
    private pharmaciesService: PharmaciesService,
    private notificationsService: NotificationsService,
    private staffService: StaffService,
  ) {}

  // Helper to resolve Pharmacy and Branch for Owners, Managers, and Staff
  async resolvePharmacyAndBranch(userId: string): Promise<{
    pharmacyId: string;
    branchId: string | null;
    isStaffOrManager: boolean;
  }> {
    try {
      const pharmacy = await this.pharmaciesService.findByUserId(userId);
      return {
        pharmacyId: pharmacy.id,
        branchId: null,
        isStaffOrManager: false,
      };
    } catch {}

    const managerBranch = await this.prisma.branch.findUnique({
      where: { managerId: userId },
    });
    if (managerBranch) {
      return {
        pharmacyId: managerBranch.pharmacyId,
        branchId: managerBranch.id,
        isStaffOrManager: true,
      };
    }

    try {
      const staff = await this.staffService.findByUserId(userId);
      return {
        pharmacyId: staff.branch.pharmacyId,
        branchId: staff.branch.id,
        isStaffOrManager: true,
      };
    } catch {
      throw new ForbiddenException(
        'User is not authorized to access medications',
      );
    }
  }

  // Create medication (Pharmacy, Manager, and Staff)
  async create(userId: string, dto: CreateMedicationDto) {
    const {
      pharmacyId,
      branchId: staffBranchId,
      isStaffOrManager,
    } = await this.resolvePharmacyAndBranch(userId);

    // FIX: Verify branch belongs to pharmacy
    const branch = await this.prisma.branch.findFirst({
      where: {
        id: dto.branchId,
        pharmacyId: pharmacyId,
        isActive: true, // Only allow active branches
      },
    });

    if (!branch) {
      throw new BadRequestException(
        'Invalid branch or branch does not belong to your pharmacy',
      );
    }

    if (isStaffOrManager && staffBranchId !== branch.id) {
      throw new ForbiddenException(
        'You can only create medications for your own branch',
      );
    }

    // Check if medication with same name already exists for this branch
    const existingMedication = await this.prisma.medication.findFirst({
      where: {
        branchId: dto.branchId,
        OR: [
          { name: { equals: dto.name, mode: 'insensitive' } },
          { chemicalName: { equals: dto.chemicalName, mode: 'insensitive' } },
        ],
      },
    });

    // If medication exists in this branch, add to the quantity instead of creating a new one
    if (existingMedication) {
      return this.prisma.medication.update({
        where: { id: existingMedication.id },
        data: {
          quantity: {
            increment: dto.quantity,
          },
          // Optionally update other fields if provided
          price: dto.price ?? existingMedication.price,
          chemicalName: dto.chemicalName ?? existingMedication.chemicalName,
          description: dto.description ?? existingMedication.description,
          category: dto.category ?? existingMedication.category,
          lowStockThreshold:
            dto.lowStockThreshold ?? existingMedication.lowStockThreshold,
          imageUrl: dto.imageUrl ?? existingMedication.imageUrl,
        },
        include: {
          pharmacy: {
            select: { name: true },
          },
          branch: {
            select: { name: true, address: true },
          },
        },
      });
    }

    // Check if registry ID is provided
    let registryData = null;
    if (dto.registryId) {
      registryData = await this.prisma.medicationRegistry.findUnique({
        where: { id: dto.registryId },
      });

      if (!registryData) {
        throw new NotFoundException('Registry medication not found');
      }
    }

    // Create new medication if it doesn't exist
    return this.prisma.medication.create({
      data: {
        name: registryData ? registryData.brandName : dto.name,
        chemicalName: registryData
          ? registryData.genericName
          : dto.chemicalName,
        description: registryData
          ? `${registryData.dosageForm} - ${registryData.dosageStrength}. Manufactured by ${registryData.manufacturerName}.`
          : dto.description,
        category: dto.category, // Category still needs to be provided manually or mapped
        price: dto.price,
        quantity: dto.quantity,
        lowStockThreshold: dto.lowStockThreshold ?? 10,
        requiresPrescription: dto.requiresPrescription,
        imageUrl: dto.imageUrl,
        pharmacyId: pharmacyId,
        branchId: dto.branchId,
        registryId: dto.registryId, // Link to registry
      },
      include: {
        pharmacy: {
          select: { name: true },
        },
        branch: {
          select: { name: true, address: true },
        },
      },
    });
  }

  // Get all medications for a pharmacy by pharmacy ID
  async findByPharmacy(pharmacyId: string) {
    return this.prisma.medication.findMany({
      where: { pharmacyId },
      include: {
        branch: {
          select: { name: true, address: true },
        },
      },
      orderBy: { name: 'asc' },
    });
  }

  // Get all medications for a pharmacy by user ID
  async findByPharmacyUserId(userId: string) {
    const { pharmacyId, branchId } =
      await this.resolvePharmacyAndBranch(userId);
    if (branchId) {
      return this.findByBranch(branchId);
    }
    return this.findByPharmacy(pharmacyId);
  }

  // Get medications by branch
  async findByBranch(branchId: string) {
    return this.prisma.medication.findMany({
      where: { branchId },
      include: {
        pharmacy: {
          select: { name: true },
        },
        branch: {
          select: { name: true, address: true },
        },
      },
      orderBy: { name: 'asc' },
    });
  }

  // Get medication by ID
  async findById(id: string) {
    const medication = await this.prisma.medication.findUnique({
      where: { id },
      include: {
        pharmacy: true,
        branch: true,
      },
    });

    if (!medication) {
      throw new NotFoundException('Medication not found');
    }

    return medication;
  }

  // Update medication
  async update(id: string, userId: string, dto: UpdateMedicationDto) {
    const medication = await this.findById(id);
    const {
      pharmacyId,
      branchId: staffBranchId,
      isStaffOrManager,
    } = await this.resolvePharmacyAndBranch(userId);

    if (medication.pharmacyId !== pharmacyId) {
      throw new ForbiddenException('You can only update your own medications');
    }

    if (isStaffOrManager && medication.branchId !== staffBranchId) {
      throw new ForbiddenException(
        'You can only update medications in your own branch',
      );
    }

    // If updating branchId, verify it belongs to pharmacy
    if (dto.branchId && dto.branchId !== medication.branchId) {
      if (isStaffOrManager) {
        throw new ForbiddenException(
          'Staff members cannot move medications between branches',
        );
      }

      const branch = await this.prisma.branch.findFirst({
        where: {
          id: dto.branchId,
          pharmacyId: pharmacyId,
          isActive: true,
        },
      });

      if (!branch) {
        throw new BadRequestException(
          'Invalid branch or branch does not belong to your pharmacy',
        );
      }
    }

    // If updating the name, check for duplicates in the same branch
    if (dto.name) {
      const targetBranchId = dto.branchId || medication.branchId;

      const existingMedication = await this.prisma.medication.findFirst({
        where: {
          branchId: targetBranchId,
          pharmacyId: pharmacyId,
          name: {
            equals: dto.name,
            mode: 'insensitive',
          },
          NOT: {
            id: id, // Exclude current medication
          },
        },
      });

      if (existingMedication) {
        throw new ConflictException(
          `A medication with the name "${dto.name}" already exists in this branch`,
        );
      }
    }

    return this.prisma.medication.update({
      where: { id },
      data: dto,
      include: {
        pharmacy: {
          select: { name: true },
        },
        branch: {
          select: { name: true, address: true },
        },
      },
    });
  }

  // Delete medication
  async delete(id: string, userId: string) {
    const medication = await this.findById(id);
    const {
      pharmacyId,
      branchId: staffBranchId,
      isStaffOrManager,
    } = await this.resolvePharmacyAndBranch(userId);

    if (medication.pharmacyId !== pharmacyId) {
      throw new ForbiddenException('You can only delete your own medications');
    }

    if (isStaffOrManager && medication.branchId !== staffBranchId) {
      throw new ForbiddenException(
        'You can only delete medications in your own branch',
      );
    }

    await this.prisma.medication.delete({
      where: { id },
    });

    return { message: 'Medication deleted successfully' };
  }

  // Search medications across all pharmacies
  async search(dto: SearchMedicationsDto) {
    const where: any = {};

    // Filter by specific pharmacy if provided
    if (dto.pharmacyId) {
      where.pharmacyId = dto.pharmacyId;
    }

    // FIX: Add branch filtering support
    if (dto.branchId) {
      where.branchId = dto.branchId;
    }

    if (dto.query) {
      where.OR = [
        { name: { contains: dto.query, mode: 'insensitive' } },
        { chemicalName: { contains: dto.query, mode: 'insensitive' } },
        { category: { contains: dto.query, mode: 'insensitive' } },
      ];
    }

    if (dto.category) {
      where.category = { contains: dto.category, mode: 'insensitive' };
    }

    if (dto.requiresPrescription !== undefined) {
      where.requiresPrescription = dto.requiresPrescription;
    }

    // Only show medications from approved pharmacies and active branches
    where.pharmacy = {
      status: 'APPROVED',
    };

    where.branch = {
      isActive: true,
    };

    // Only show in-stock medications
    where.quantity = {
      gt: 0,
    };

    const medications = await this.prisma.medication.findMany({
      where,
      include: {
        pharmacy: {
          select: {
            id: true,
            name: true,
            address: true,
            phone: true,
            latitude: true,
            longitude: true,
          },
        },
        branch: {
          select: {
            id: true,
            name: true,
            address: true,
            latitude: true,
            longitude: true,
          },
        },
      },
      orderBy: { name: 'asc' },
      take: dto.limit || 100,
    });

    return medications;
  }

  // Get low stock medications for a pharmacy
  async getLowStock(userId: string) {
    const { pharmacyId, branchId } =
      await this.resolvePharmacyAndBranch(userId);

    // Use raw query to compare quantity against lowStockThreshold column
    let lowStockIds;
    if (branchId) {
      lowStockIds = await this.prisma.$queryRaw<{ id: string }[]>`
        SELECT id FROM medications
        WHERE "pharmacyId" = ${pharmacyId} AND "branchId" = ${branchId}
          AND quantity <= "lowStockThreshold"
          AND quantity > 0
      `;
    } else {
      lowStockIds = await this.prisma.$queryRaw<{ id: string }[]>`
        SELECT id FROM medications
        WHERE "pharmacyId" = ${pharmacyId}
          AND quantity <= "lowStockThreshold"
          AND quantity > 0
      `;
    }

    if (lowStockIds.length === 0) return [];

    return this.prisma.medication.findMany({
      where: {
        id: { in: lowStockIds.map((m) => m.id) },
      },
      include: {
        branch: {
          select: { name: true, address: true },
        },
      },
      orderBy: { quantity: 'asc' },
    });
  }

  // Get out of stock medications
  async getOutOfStock(userId: string) {
    const { pharmacyId, branchId } =
      await this.resolvePharmacyAndBranch(userId);

    const where: any = {
      pharmacyId,
      quantity: 0,
    };

    if (branchId) {
      where.branchId = branchId;
    }

    return this.prisma.medication.findMany({
      where,
      include: {
        branch: {
          select: { name: true, address: true },
        },
      },
      orderBy: { name: 'asc' },
    });
  }

  // Reduce stock with atomic operation + low-stock alerts
  async reduceStock(medicationId: string, quantity: number) {
    // Check stock BEFORE decrementing
    const medication = await this.prisma.medication.findUnique({
      where: { id: medicationId },
      include: {
        branch: { select: { name: true } },
        pharmacy: { select: { id: true, userId: true, name: true } },
      },
    });

    if (!medication) {
      throw new NotFoundException('Medication not found');
    }

    if (medication.quantity < quantity) {
      throw new ForbiddenException('Insufficient stock');
    }

    // Atomically decrement stock
    const updated = await this.prisma.medication.update({
      where: { id: medicationId },
      data: {
        quantity: {
          decrement: quantity,
        },
      },
    });

    // Send low-stock notification to pharmacy owner
    if (
      updated.quantity <= medication.lowStockThreshold &&
      updated.quantity > 0
    ) {
      try {
        await this.notificationsService.create({
          pharmacyId: medication.pharmacy.id,
          type: 'LOW_STOCK',
          title: 'Low Stock Alert',
          message: `Warning: ${medication.name}${medication.chemicalName ? ` (${medication.chemicalName})` : ''} is running low. Only ${updated.quantity} left in ${medication.branch.name}.`,
        });
      } catch (error) {
        console.error('Failed to send low stock notification:', error);
      }
    }

    // Send out-of-stock notification
    if (updated.quantity === 0) {
      try {
        await this.notificationsService.create({
          pharmacyId: medication.pharmacy.id,
          type: 'LOW_STOCK',
          title: 'Out of Stock Alert',
          message: `${medication.name}${medication.chemicalName ? ` (${medication.chemicalName})` : ''} is now OUT OF STOCK in ${medication.branch.name}. Please restock immediately.`,
        });
      } catch (error) {
        console.error('Failed to send out-of-stock notification:', error);
      }
    }

    return updated;
  }

  // Search official FDA registry
  async searchRegistry(query: string) {
    if (!query || query.length < 2) {
      return [];
    }

    return this.prisma.medicationRegistry.findMany({
      where: {
        OR: [
          { brandName: { contains: query, mode: 'insensitive' } },
          { genericName: { contains: query, mode: 'insensitive' } },
          { registrationNumber: { contains: query, mode: 'insensitive' } },
        ],
      },
      take: 20,
    });
  }

  // Restore stock (called when order is cancelled)
  async restoreStock(medicationId: string, quantity: number) {
    return this.prisma.medication.update({
      where: { id: medicationId },
      data: {
        quantity: {
          increment: quantity,
        },
      },
    });
  }

  // Bulk create/upsert medications from CSV upload
  async bulkCreate(userId: string, dto: BulkCreateMedicationDto) {
    const {
      pharmacyId,
      branchId: staffBranchId,
      isStaffOrManager,
    } = await this.resolvePharmacyAndBranch(userId);

    const branch = await this.prisma.branch.findFirst({
      where: { id: dto.branchId, pharmacyId, isActive: true },
    });
    if (!branch) {
      throw new BadRequestException(
        'Invalid branch or branch does not belong to your pharmacy',
      );
    }
    if (isStaffOrManager && staffBranchId !== branch.id) {
      throw new ForbiddenException(
        'You can only create medications for your own branch',
      );
    }

    const created: string[] = [];
    const updated: string[] = [];
    const errors: { row: number; name: string; error: string }[] = [];

    for (let i = 0; i < dto.medications.length; i++) {
      const item = dto.medications[i];
      try {
        const existing = await this.prisma.medication.findFirst({
          where: {
            branchId: dto.branchId,
            OR: [
              { name: { equals: item.name, mode: 'insensitive' } },
              ...(item.chemicalName
                ? [{ chemicalName: { equals: item.chemicalName, mode: Prisma.QueryMode.insensitive } }]
                : []),
            ],
          },
        });

        if (existing) {
          await this.prisma.medication.update({
            where: { id: existing.id },
            data: {
              quantity: { increment: item.quantity },
              price: item.price ?? existing.price,
              category: item.category ?? existing.category,
              chemicalName: item.chemicalName ?? existing.chemicalName,
              description: item.description ?? existing.description,
              lowStockThreshold: item.lowStockThreshold ?? existing.lowStockThreshold,
              manufacturer: item.manufacturer ?? existing.manufacturer,
              batchNumber: item.batchNumber ?? existing.batchNumber,
              expiryDate: item.expiryDate ? new Date(item.expiryDate) : existing.expiryDate,
            },
          });
          updated.push(item.name);
        } else {
          await this.prisma.medication.create({
            data: {
              name: item.name,
              chemicalName: item.chemicalName,
              description: item.description,
              category: item.category,
              price: item.price,
              quantity: item.quantity,
              lowStockThreshold: item.lowStockThreshold ?? 10,
              requiresPrescription: item.requiresPrescription ?? false,
              pharmacyId,
              branchId: dto.branchId,
              manufacturer: item.manufacturer,
              batchNumber: item.batchNumber,
              expiryDate: item.expiryDate ? new Date(item.expiryDate) : null,
            },
          });
          created.push(item.name);
        }
      } catch (err) {
        errors.push({ row: i + 1, name: item.name, error: String(err) });
      }
    }

    return {
      created: created.length,
      updated: updated.length,
      errors,
    };
  }
}
