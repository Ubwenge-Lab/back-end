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
        // Only fetch branches that actually have coordinates set
        latitude: { not: null },
        longitude: { not: null },
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

    // 2. Map and Calculate Distance in one pass (Restoring Benjamin's original logic)
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

  async getNearbyPharmacies(lat: number, lng: number, radius: number, userId?: string) {
    // 1. Update patient location if userId is provided (Recording recent location)
    if (userId) {
      await this.prisma.patient.updateMany({
        where: { userId },
        data: { lastLat: lat, lastLng: lng },
      }).catch(err => console.error('Failed to update patient last location:', err));
    }

    // 2. Fetch all Approved pharmacies and active Branches that have coordinates
    const [pharmacies, branches] = await Promise.all([
      this.prisma.pharmacy.findMany({
        where: { 
          status: 'APPROVED', 
          latitude: { not: null }, 
          longitude: { not: null } 
        },
        select: { 
          id: true, 
          name: true, 
          latitude: true, 
          longitude: true, 
          address: true 
        },
      }),
      this.prisma.branch.findMany({
        where: {
          isActive: true,
          branchStatus: 'APPROVED',
          latitude: { not: null },
          longitude: { not: null },
          pharmacy: { status: 'APPROVED' },
        },
        select: {
          id: true,
          name: true,
          latitude: true,
          longitude: true,
          address: true,
          pharmacy: { select: { name: true } },
        },
      }),
    ]);

    // 3. Unify into a single list of locations
    const allLocations = [
      ...pharmacies.map((p) => ({
        id: p.id,
        name: p.name,
        address: p.address,
        latitude: p.latitude,
        longitude: p.longitude,
        type: 'MAIN',
      })),
      ...branches.map((b) => ({
        id: b.id,
        name: `${b.pharmacy.name} - ${b.name}`,
        address: b.address,
        latitude: b.latitude,
        longitude: b.longitude,
        type: 'BRANCH',
      })),
    ];

    // 4. Calculate distance, filter by radius, and sort
    return allLocations
      .map((loc) => {
        const distance = this.calculateHaversine(
          lat,
          lng,
          loc.latitude,
          loc.longitude,
        );
        return { 
          ...loc, 
          distance: parseFloat(distance.toFixed(1)) 
        };
      })
      .filter((loc) => loc.distance <= radius)
      .sort((a, b) => a.distance - b.distance);
  }

  private calculateHaversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
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
}
