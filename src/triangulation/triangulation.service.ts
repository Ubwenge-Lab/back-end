import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TriangulationService {
    constructor(private prisma: PrismaService) { }

    async getGlobalCoordinates() {
        // 1. Fetch main pharmacy coordinates
        const pharmacies = await this.prisma.pharmacy.findMany({
            select: {
                id: true,
                name: true,
                latitude: true,
                longitude: true,
                status: true,
                address: true,
            },
        });

        // 2. Fetch all branch coordinates
        const branches = await this.prisma.branch.findMany({
            select: {
                id: true,
                pharmacyId: true,
                name: true,
                latitude: true,
                longitude: true,
                branchStatus: true,
                address: true,
            },
        });

        return {
            pharmacies,
            branches,
        };
    }
}

// logic for patient_view triangulation and using of the haversine calculation for Lat and Lng

@Injectable()
export class TriangulationService {
  constructor(private prisma: PrismaService) {}

  async getNearbyBranches(patientLat: number, patientLng: number) {
    const branches = await this.prisma.branch.findMany({
      where: {
        pharmacy: {
          status: 'APPROVED',
        },
      },
      include: {
        pharmacy: {
          select: { name: true, phone: true },
        },
      },
    });

    return branches
      .map((branch) => {
        const distance = this.calculateHaversine(
          patientLat,
          patientLng,
          branch.latitude,
          branch.longitude,
        );

        return {
          ...branch,
          distance: parseFloat(distance.toFixed(2)),
        };
      })
      .sort((a, b) => a.distance - b.distance);
  }

  private calculateHaversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }
}
