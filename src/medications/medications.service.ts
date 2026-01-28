// backend/src/medications/medications.service.ts

import { Injectable, NotFoundException, ForbiddenException, ConflictException } from '@nestjs/common';
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

    // Check if medication with same name already exists for this pharmacy
    const existingMedication = await this.prisma.medication.findFirst({
      where: {
        pharmacyId: pharmacy.id,
        name: {
          equals: dto.name,
          mode: 'insensitive',
        },
      },
    });

    // If medication exists, add to the quantity instead of creating a new one
    if (existingMedication) {
      return this.prisma.medication.update({
        where: { id: existingMedication.id },
        data: {
          quantity: {
            increment: dto.quantity,
          },
          // Optionally update other fields if provided
          price: dto.price ?? existingMedication.price,
          description: dto.description ?? existingMedication.description,
          category: dto.category ?? existingMedication.category,
          lowStockThreshold: dto.lowStockThreshold ?? existingMedication.lowStockThreshold,
          imageUrl: dto.imageUrl ?? existingMedication.imageUrl,
        },
        include: {
          pharmacy: {
            select: { name: true },
          },
        },
      });
    }

    // Create new medication if it doesn't exist
    return this.prisma.medication.create({
      data: {
        ...dto,
        pharmacyId: pharmacy.id,
      },
      include: {
        pharmacy: {
          select: { name: true },
        },
      },
    });
  }

  // Get all medications for a pharmacy by pharmacy ID
  async findByPharmacy(pharmacyId: string) {
    return this.prisma.medication.findMany({
      where: { pharmacyId },
      orderBy: { name: 'asc' },
    });
  }

  // Get all medications for a pharmacy by user ID
  async findByPharmacyUserId(userId: string) {
    const pharmacy = await this.pharmaciesService.findByUserId(userId);
    return this.findByPharmacy(pharmacy.id);
  }

  // Get medication by ID
  async findById(id: string) {
    const medication = await this.prisma.medication.findUnique({
      where: { id },
      include: {
        pharmacy: true,
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

    // If updating the name, check for duplicates
    if (dto.name) {
      const existingMedication = await this.prisma.medication.findFirst({
        where: {
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
          `A medication with the name "${dto.name}" already exists in your pharmacy`,
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

    if (dto.query) {
      where.OR = [
        { name: { contains: dto.query, mode: 'insensitive' } },
        { category: { contains: dto.query, mode: 'insensitive' } },
      ];
    }

    if (dto.category) {
      where.category = { contains: dto.category, mode: 'insensitive' };
    }

    if (dto.requiresPrescription !== undefined) {
      where.requiresPrescription = dto.requiresPrescription;
    }

    // Only show medications from approved pharmacies
    where.pharmacy = {
      status: 'APPROVED',
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
          lte: 10, // Default threshold
          gt: 0,
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
      orderBy: { name: 'asc' },
    });
  }

  // Reduce stock (called when order is placed)
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