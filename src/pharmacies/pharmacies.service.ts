// backend/src/pharmacies/pharmacies.service.ts

import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UpdatePharmacyDto } from './dto/update-pharmacy.dto';

@Injectable()
export class PharmaciesService {
  constructor(private prisma: PrismaService) {}

  async findAll(status?: string) {
    const where = status ? { status: status as any } : {};

    return this.prisma.pharmacy.findMany({
      where,
      include: {
        user: {
          select: { email: true },
        },
        _count: {
          select: { medications: true, orders: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findById(id: string) {
    const pharmacy = await this.prisma.pharmacy.findUnique({
      where: { id },
      include: {
        user: {
          select: { email: true },
        },
        medications: true,
        _count: {
          select: { orders: true },
        },
      },
    });

    if (!pharmacy) {
      throw new NotFoundException('Pharmacy not found');
    }

    return pharmacy;
  }

  async findByUserId(userId: string) {
    const pharmacy = await this.prisma.pharmacy.findUnique({
      where: { userId },
      include: {
        _count: {
          select: { medications: true, orders: true },
        },
      },
    });

    if (!pharmacy) {
      throw new NotFoundException('Pharmacy not found');
    }

    return pharmacy;
  }

  async update(id: string, dto: UpdatePharmacyDto) {
    return this.prisma.pharmacy.update({
      where: { id },
      data: dto,
    });
  }

  async getProfile(userId: string) {
    return this.findByUserId(userId);
  }

  // Get approved pharmacies for patients
  async getApprovedPharmacies() {
    return this.prisma.pharmacy.findMany({
      where: { status: 'APPROVED' },
      include: {
        _count: {
          select: { medications: true },
        },
      },
      orderBy: { name: 'asc' },
    });
  }

  // Calculate distance between two coordinates (Haversine formula)
  calculateDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number,
  ): number {
    const R = 6371; // Earth's radius in km
    const dLat = this.deg2rad(lat2 - lat1);
    const dLon = this.deg2rad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.deg2rad(lat1)) *
        Math.cos(this.deg2rad(lat2)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private deg2rad(deg: number): number {
    return deg * (Math.PI / 180);
  }

  // Get delivery fee based on distance
  getDeliveryFee(pharmacyId: string, distance: number): number {
    // Default zones if pharmacy hasn't set custom ones
    const defaultZones = [
      { name: 'Zone 1', maxDistance: 5, fee: 1000 },
      { name: 'Zone 2', maxDistance: 10, fee: 2000 },
      { name: 'Zone 3', maxDistance: 15, fee: 3000 },
      { name: 'Zone 4', maxDistance: 999, fee: 5000 },
    ];

    for (const zone of defaultZones) {
      if (distance <= zone.maxDistance) {
        return zone.fee;
      }
    }

    return 5000; // Max fee
  }
}