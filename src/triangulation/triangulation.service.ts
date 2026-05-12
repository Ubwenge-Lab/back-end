import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LocationService } from '../location/location.service';
import { MapDataQueryDto } from './dto/map-data-query.dto';
import { PROXIMITY_RADIUS_KM, DistrictName } from './triangulation.constants';
import { getDistrict } from './triangulation.helpers';
import {
  DistrictGroup,
  PatientMapPoint,
  ResolvedPatient,
} from './triangulation.types';
import { toPharmacyLocationDto } from '../pharmacies/utils/pharmacy.mapper';
import { PharmacyLocationDto } from '../pharmacies/dto/pharmacy_location.dto';

@Injectable()
export class TriangulationService {
  private readonly logger = new Logger(TriangulationService.name);

  constructor(
    private prisma: PrismaService,
    private locationService: LocationService,
  ) {}

  // Fetches all active physical locations where a patient can go.
  // This unifies Branches and Pharmacies into a single searchable list.

  async getGlobalCoordinates() {
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

    return { pharmacies, branches };
  }

  async getNearbyBranches(patientLat: number, patientLng: number) {
    const allLocations = await this.prisma.branch.findMany({
      where: {
        pharmacy: { status: 'APPROVED' },
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        latitude: true,
        longitude: true,
        address: true,
        pharmacy: {
          select: { name: true, status: true },
        },
      },
    });

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

  async getNearbyPharmacies(
    lat: number,
    lng: number,
    radius: number,
    userId?: string,
  ) {
    if (userId) {
      await this.prisma.patient
        .updateMany({
          where: { userId },
          data: { lastLat: lat, lastLng: lng },
        })
        .catch((err) =>
          console.error('Failed to update patient last location:', err),
        );
    }

    const [pharmacies, branches] = await Promise.all([
      this.prisma.pharmacy.findMany({
        where: {
          status: 'APPROVED',
        },
        select: {
          id: true,
          name: true,
          latitude: true,
          longitude: true,
          address: true,
          phone: true,
          operatingHours: true,
          status: true,
        },
      }),
      this.prisma.branch.findMany({
        where: {
          isActive: true,
          branchStatus: 'APPROVED',
          pharmacy: { status: 'APPROVED' },
        },
        select: {
          id: true,
          name: true,
          latitude: true,
          longitude: true,
          address: true,
          phone: true,
          operatingHours: true,
          isActive: true,
          branchStatus: true,
          pharmacy: { select: { name: true } },
        },
      }),
    ]);

    const allLocations = [
      ...pharmacies.map((p) => ({ ...p, type: 'MAIN' })),
      ...branches.map((b) => ({
        ...b,
        name: `${b.pharmacy.name} - ${b.name}`,
        type: 'BRANCH',
        status: String(b.branchStatus),
      })),
    ];

    const dayOfWeek = new Date()
      .toLocaleString('en-US', { timeZone: 'Africa/Kigali', weekday: 'long' })
      .toLowerCase();

    return allLocations
      .map((loc) => {
        const distance = this.calculateHaversine(lat, lng, loc.latitude, loc.longitude);
        return { ...loc, distance: parseFloat(distance.toFixed(1)) };
      })
      .filter((loc) => loc.distance <= radius)
      .sort((a, b) => a.distance - b.distance)
      .map((loc) => {
        const operatingHoursMap = loc.operatingHours as Record<
          string,
          { open?: string; close?: string } | undefined
        > | null;
        const todayHours = operatingHoursMap
          ? operatingHoursMap[dayOfWeek]
          : null;
        const hoursString =
          todayHours && todayHours.open && todayHours.close
            ? `${todayHours.open}-${todayHours.close}`
            : null;

        return toPharmacyLocationDto(
          {
            ...loc,
            hours: hoursString,
            region:
              loc.latitude && loc.longitude
                ? getDistrict(loc.latitude, loc.longitude, loc.address)
                : 'Unknown',
            rating: null,
            isActive:
              loc.type === 'MAIN'
                ? loc.status === 'APPROVED'
                : (loc as { isActive?: boolean }).isActive === true &&
                  loc.status === 'APPROVED',
          },
          loc.distance,
        );
      });
  }

  private calculateHaversine(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number,
  ): number {
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

  async getMapData(query: MapDataQueryDto) {
    const { view = 'all', district = 'all' } = query;

    const pharmacies = await this.prisma.pharmacy.findMany({
      where: { status: 'APPROVED' },
      select: {
        id: true,
        name: true,
        address: true,
        latitude: true,
        longitude: true,
        status: true,
        branches: {
          select: {
            id: true,
            name: true,
            address: true,
            latitude: true,
            longitude: true,
            isActive: true,
            branchStatus: true,
          },
        },
      },
    });

    const patients = await this.prisma.patient.findMany({
      select: {
        id: true,
        address: true,
        lastLat: true,
        lastLng: true,
        user: { select: { id: true } },
      },
    });

    const resolvedPatients: ResolvedPatient[] = [];

    for (const patient of patients) {
      const coords = await this.locationService.verifyAndFallbackCoordinates(
        patient.user.id,
        'PATIENT',
        patient.lastLat ?? undefined,
        patient.lastLng ?? undefined,
      );

      if (!coords) {
        this.logger.warn(`Could not resolve coordinates for patient ${patient.id}, skipping.`);
        continue;
      }

      const locationSource =
        patient.lastLat !== null && patient.lastLng !== null
          ? 'LIVE_GPS'
          : 'FIXED_FALLBACK';

      if (view === 'live' && locationSource !== 'LIVE_GPS') continue;
      if (view === 'fixed' && locationSource !== 'FIXED_FALLBACK') continue;

      resolvedPatients.push({
        patientId: patient.id,
        lat: coords.latitude,
        lng: coords.longitude,
        locationSource,
      });
    }

    const districtMap: Record<DistrictName, DistrictGroup> = {
      Gasabo:    { name: 'Gasabo',    pharmacies: [], branches: [], totalNearbyPatients: 0 },
      Kicukiro:  { name: 'Kicukiro',  pharmacies: [], branches: [], totalNearbyPatients: 0 },
      Nyarugenge:{ name: 'Nyarugenge',pharmacies: [], branches: [], totalNearbyPatients: 0 },
      Other:     { name: 'Other',     pharmacies: [], branches: [], totalNearbyPatients: 0 },
    };

    for (const pharmacy of pharmacies) {
      const pharmLat = pharmacy.latitude;
      const pharmLng = pharmacy.longitude;
      const pharmDistrict =
        pharmLat && pharmLng
          ? getDistrict(pharmLat, pharmLng, pharmacy.address)
          : 'Other';

      districtMap[pharmDistrict].pharmacies.push({
        id: pharmacy.id,
        name: pharmacy.name,
        address: pharmacy.address,
        coordinates: { lat: pharmLat, lng: pharmLng },
        status: pharmacy.status,
        branchCount: pharmacy.branches.length,
      });

      for (const branch of pharmacy.branches) {
        if (!branch.latitude || !branch.longitude) continue;
        const branchDistrict = getDistrict(branch.latitude, branch.longitude, branch.address);
        const nearbyPatients: PatientMapPoint[] = [];

        for (const patient of resolvedPatients) {
          const distance = this.calculateHaversine(
            patient.lat,
            patient.lng,
            branch.latitude,
            branch.longitude,
          );

          if (distance <= PROXIMITY_RADIUS_KM) {
            nearbyPatients.push({
              patientId: patient.patientId,
              coordinates: { lat: patient.lat, lng: patient.lng },
              locationSource: patient.locationSource,
              distanceKm: Math.round(distance * 100) / 100,
            });
          }
        }

        districtMap[branchDistrict].branches.push({
          id: branch.id,
          name: branch.name,
          address: branch.address,
          district: branchDistrict,
          coordinates: { lat: branch.latitude, lng: branch.longitude },
          pharmacyName: pharmacy.name,
          pharmacyId: pharmacy.id,
          isActive: branch.isActive,
          nearbyPatientCount: nearbyPatients.length,
          nearbyPatients,
        });

        districtMap[branchDistrict].totalNearbyPatients += nearbyPatients.length;
      }
    }

    let districts = Object.values(districtMap);
    if (district !== 'all') {
      districts = districts.filter((d) => d.name === district);
    }

    return {
      generatedAt: new Date().toISOString(),
      totalPharmacies: pharmacies.length,
      totalBranches: pharmacies.reduce((sum, p) => sum + p.branches.length, 0),
      totalPatientsMapped: resolvedPatients.length,
      filters: { view, district },
      districts,
    };
  }

  async getOwnerBranches(pharmacyId: string) {
    const branches = await this.prisma.branch.findMany({
      where: { pharmacyId, isActive: true },
      select: {
        id: true,
        name: true,
        latitude: true,
        longitude: true,
        address: true,
        pharmacy: { select: { name: true } },
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
    const managerBranch = await this.prisma.branch.findFirst({
      where: { managerId, isActive: true },
      select: {
        id: true,
        pharmacyId: true,
        name: true,
        latitude: true,
        longitude: true,
        address: true,
        pharmacy: { select: { name: true } },
      },
    });

    if (!managerBranch) {
      throw new Error('Manager branch not found or inactive');
    }

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
        pharmacy: { select: { name: true } },
      },
    });

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

  async getCompetitors(userId: string): Promise<PharmacyLocationDto[]> {
    try {
      const managerBranch = await this.prisma.branch.findFirst({
        where: { managerId: userId },
        select: {
          id: true,
          pharmacyId: true,
          latitude: true,
          longitude: true,
        }
      });

      if (!managerBranch || !managerBranch.latitude || !managerBranch.longitude) {
        return [];
      }

      const dayOfWeek = new Date()
        .toLocaleString('en-US', { timeZone: 'Africa/Kigali', weekday: 'long' })
        .toLowerCase();

      const allBranches = await this.prisma.branch.findMany({
        where: {
          isActive: true,
          pharmacy: { status: 'APPROVED' }
        },
        select: {
          id: true,
          name: true,
          latitude: true,
          longitude: true,
          address: true,
          phone: true,
          pharmacyId: true,
          operatingHours: true,
        },
      });

      const competitors: PharmacyLocationDto[] = [];

      for (const b of allBranches) {
        if (b.pharmacyId !== managerBranch.pharmacyId) {
          const distance = this.calculateHaversine(
            managerBranch.latitude,
            managerBranch.longitude,
            b.latitude,
            b.longitude
          );

          if (distance <= PROXIMITY_RADIUS_KM) {
            const todayHours = b.operatingHours ? (b.operatingHours as any)[dayOfWeek] : null;
            const hoursString = todayHours?.open && todayHours?.close
              ? `${todayHours.open}-${todayHours.close}`
              : null;

            competitors.push(
              toPharmacyLocationDto(
                { ...b, hours: hoursString, region: null, rating: null, isActive: true },
                parseFloat(distance.toFixed(2))
              )
            );
          }
        }
      }

      competitors.sort((a, b) => a.distance - b.distance);
      return competitors;

    } catch (error) {
      this.logger.error(`Error fetching competitors for user ${userId}:`, error);
      throw new Error('Failed to fetch competitor data');
    }
  }
}