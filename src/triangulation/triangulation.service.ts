import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LocationService } from '../location/location.service';
import { MapDataQueryDto } from './dto/map-data-query.dto';
import { PROXIMITY_RADIUS_KM, DistrictName } from './triangulation.constants';
import { getDistrict} from './triangulation.helpers';
import { DistrictGroup, PatientMapPoint, ResolvedPatient } from './triangulation.types';


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

    async getMapData(query: MapDataQueryDto) {
    const { view = 'all', district = 'all' } = query;

    // 1. Fetch all APPROVED pharmacies with their branches
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

    // 2. Fetch all patients
    const patients = await this.prisma.patient.findMany({
      select: {
        id: true,
        address: true,
        lastLat: true,
        lastLng: true,
        user: { select: { id: true } },
      },
    });

    // 3. Resolve each patient's coordinates (GPS or fallback)
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

      const locationSource = (patient.lastLat !== null && patient.lastLng !== null)
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

    // 4. Build district groups
    const districtMap: Record<DistrictName, DistrictGroup> = {
      Gasabo:     { name: 'Gasabo',     pharmacies: [], branches: [], totalNearbyPatients: 0 },
      Kicukiro:   { name: 'Kicukiro',   pharmacies: [], branches: [], totalNearbyPatients: 0 },
      Nyarugenge: { name: 'Nyarugenge', pharmacies: [], branches: [], totalNearbyPatients: 0 },
      Other:      { name: 'Other',      pharmacies: [], branches: [], totalNearbyPatients: 0 },
    };

    for (const pharmacy of pharmacies) {
      const pharmLat = pharmacy.latitude;
      const pharmLng = pharmacy.longitude;
      const pharmDistrict = pharmLat && pharmLng ? getDistrict(pharmLat, pharmLng, pharmacy.address) : 'Other';

      districtMap[pharmDistrict].pharmacies.push({
        id: pharmacy.id,
        name: pharmacy.name,
        address: pharmacy.address,
        coordinates: { lat: pharmLat, lng: pharmLng },
        status: pharmacy.status,
        branchCount: pharmacy.branches.length,
      });

      for (const branch of pharmacy.branches) {
        const branchDistrict = getDistrict(branch.latitude, branch.longitude, branch.address);
        const nearbyPatients: PatientMapPoint[] = [];

        for (const patient of resolvedPatients) {
          const distance = this.calculateHaversine(
            patient.lat, patient.lng,
            branch.latitude, branch.longitude,
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

    // 5. Apply district filter and return
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

}
