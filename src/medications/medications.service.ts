// backend/src/medications/medications.service.ts

import { Injectable, NotFoundException, ForbiddenException, ConflictException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PharmaciesService } from '../pharmacies/pharmacies.service';
import { CreateMedicationDto, UpdateMedicationDto, SearchMedicationsDto } from './dto';

@Injectable()
export class MedicationsService {
  constructor(
    private prisma: PrismaService,
    private pharmaciesService: PharmaciesService,
  ) {}

  // Create medication (Pharmacy only)
  async create(userId: string, dto: CreateMedicationDto) {
    const pharmacy = await this.pharmaciesService.findByUserId(userId);

    if (pharmacy.status !== 'APPROVED') {
      throw new ForbiddenException('Pharmacy not approved yet');
    }

    // FIX: Verify branch belongs to pharmacy
    const branch = await this.prisma.branch.findFirst({
      where: {
        id: dto.branchId,
        pharmacyId: pharmacy.id,
        isActive: true, // Only allow active branches
      },
    });

    if (!branch) {
      throw new BadRequestException('Invalid branch or branch does not belong to your pharmacy');
    }

    // Check if medication with same name already exists for this branch
    const existingMedication = await this.prisma.medication.findFirst({
      where: {
        branchId: dto.branchId,
        OR: [
          { name: {equals:dto.name, mode:'insensitive'}},
          {chemicalName: {equals: dto.chemicalName, mode:'insensitive'}}
        ]
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
          lowStockThreshold: dto.lowStockThreshold ?? existingMedication.lowStockThreshold,
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

    // Create new medication if it doesn't exist
    return this.prisma.medication.create({
      data: {
        name: dto.name,
        chemicalName: dto.chemicalName,
        description: dto.description,
        category: dto.category,
        price: dto.price,
        quantity: dto.quantity,
        lowStockThreshold: dto.lowStockThreshold ?? 10,
        requiresPrescription: dto.requiresPrescription,
        imageUrl: dto.imageUrl,
        pharmacyId: pharmacy.id,
        branchId: dto.branchId,
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
    const pharmacy = await this.pharmaciesService.findByUserId(userId);
    return this.findByPharmacy(pharmacy.id);
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
    const pharmacy = await this.pharmaciesService.findByUserId(userId);

    if (medication.pharmacyId !== pharmacy.id) {
      throw new ForbiddenException('You can only update your own medications');
    }

    // If updating branchId, verify it belongs to pharmacy
    if (dto.branchId && dto.branchId !== medication.branchId) {
      const branch = await this.prisma.branch.findFirst({
        where: {
          id: dto.branchId,
          pharmacyId: pharmacy.id,
          isActive: true,
        },
      });

      if (!branch) {
        throw new BadRequestException('Invalid branch or branch does not belong to your pharmacy');
      }
    }

    // If updating the name, check for duplicates in the same branch
    if (dto.name) {
      const targetBranchId = dto.branchId || medication.branchId;

      const existingMedication = await this.prisma.medication.findFirst({
        where: {
          branchId: targetBranchId,
          pharmacyId: pharmacy.id,
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
    const pharmacy = await this.pharmaciesService.findByUserId(userId);

    if (medication.pharmacyId !== pharmacy.id) {
      throw new ForbiddenException('You can only delete your own medications');
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
    const pharmacy = await this.pharmaciesService.findByUserId(userId);

    return this.prisma.medication.findMany({
      where: {
        pharmacyId: pharmacy.id,
        quantity: {
          lte: this.prisma.medication.fields.lowStockThreshold,
          gt: 0,
        },
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
    const pharmacy = await this.pharmaciesService.findByUserId(userId);

    return this.prisma.medication.findMany({
      where: {
        pharmacyId: pharmacy.id,
        quantity: 0,
      },
      include: {
        branch: {
          select: { name: true, address: true },
        },
      },
      orderBy: { name: 'asc' },
    });
  }

  // FIX: Reduce stock with atomic operation (NO LONGER NEEDED - handled in orders service)
  // This method is kept for backward compatibility but should not be used for order creation
  async reduceStock(medicationId: string, quantity: number) {
    const medication = await this.findById(medicationId);

    if (medication.quantity < quantity) {
      throw new ForbiddenException('Insufficient stock');
    }

    return this.prisma.medication.update({
      where: { id: medicationId },
      data: {
        quantity: {
          decrement: quantity,
        },
      },
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
}