import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TriangulationService {
  constructor(private prisma: PrismaService) {}

  // Fetches all active physical locations where a patient can go.
  // This unifies Branches and Pharmacies into a single searchable list.

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
        isActive: true,
        address: true,
        branchStatus: true,
      },
    });

    return {
      pharmacies,
      branches,
    };
  }
  async getNearbyBranches(patientLat: number, patientLng: number) {
    // 1. Fetch Branches belonging to APPROVED pharmacies
    // We prioritize branches because they represent specific active outlets.
    const allLocations = await this.prisma.branch.findMany({
      where: {
        pharmacy: {
          status: 'APPROVED', // Ensure the business is licensed
        },
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        latitude: true,
        longitude: true,
        address: true,
        pharmacy: {
          select: {
            name: true,
            status: true,
          },
        },
      },
    });

    // 2. Map and Calculate Distance in one pass
    return allLocations
      .map((location) => ({
        id: location.id,
        displayName: `${location.pharmacy.name} - ${location.name}`,
        address: location.address,
        latitude: location.latitude,
        longitude: location.longitude,
        distance: this.calculateHaversine(
          patientLat,
          patientLng,
          location.latitude,
          location.longitude,
        ),
      }))
      .sort((a, b) => a.distance - b.distance);
  }

  private calculateHaversine(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number,
  ): number {
    const R = 6371; // km
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

  async getOwnerBranches(pharmacyId: string) {
    const branches = await this.prisma.branch.findMany({
      where: {
        pharmacyId: pharmacyId,
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        latitude: true,
        longitude: true,
        address: true,
        pharmacy: {
          select: {
            name: true,
          },
        },
      },
    });

    return branches.map((branch) => ({
      id: branch.id,
      displayName: `${branch.pharmacy.name} - ${branch.name}`,
      address: branch.address,
      latitude: branch.latitude,
      longitude: branch.longitude,
    }));
  }

  async getManagerTriangulation(managerId: string) {
    // Get the manager's branch
    const managerBranch = await this.prisma.branch.findFirst({
      where: {
        managerId: managerId,
        isActive: true,
      },
      select: {
        id: true,
        pharmacyId: true,
        name: true,
        latitude: true,
        longitude: true,
        address: true,
        pharmacy: {
          select: {
            name: true,
          },
        },
      },
    });

    if (!managerBranch) {
      throw new Error('Manager branch not found or inactive');
    }

    // Get all sister branches (same pharmacy, excluding self)
    const sisterBranches = await this.prisma.branch.findMany({
      where: {
        pharmacyId: managerBranch.pharmacyId,
        id: { not: managerBranch.id },
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        latitude: true,
        longitude: true,
        address: true,
        pharmacy: {
          select: {
            name: true,
          },
        },
      },
    });

    // Calculate distances from manager's branch
    const triangulation = sisterBranches.map((branch) => ({
      id: branch.id,
      displayName: `${branch.pharmacy.name} - ${branch.name}`,
      address: branch.address,
      latitude: branch.latitude,
      longitude: branch.longitude,
      distance: this.calculateHaversine(
        managerBranch.latitude,
        managerBranch.longitude,
        branch.latitude,
        branch.longitude,
      ),
    }));

    return {
      managerBranch: {
        id: managerBranch.id,
        displayName: `${managerBranch.pharmacy.name} - ${managerBranch.name}`,
        address: managerBranch.address,
        latitude: managerBranch.latitude,
        longitude: managerBranch.longitude,
      },
      sisterBranches: triangulation.sort((a, b) => a.distance - b.distance),
    };
  }
}
