import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { PrismaService } from '../prisma/prisma.service';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class LocationService {
  private readonly logger = new Logger(LocationService.name);

  constructor(
    private readonly httpService: HttpService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Translates a raw text address into coordinates using OpenStreetMap Nominatim.
   * Returns null if it fails or if the address is not found/legit.
   */
  async geocodeAddress(
    address: string,
  ): Promise<{ latitude: number; longitude: number } | null> {
    if (!address) return null;

    try {
      // Nominatim requires an explicit User-Agent header
      const response = await firstValueFrom(
        this.httpService.get('https://nominatim.openstreetmap.org/search', {
          params: {
            q: address,
            format: 'json',
            limit: 1,
          },
          headers: {
            'User-Agent': 'EVuzePharmacyApp/1.0',
          },
        }),
      );

      const data = response.data;
      if (data && data.length > 0) {
        return {
          latitude: parseFloat(data[0].lat),
          longitude: parseFloat(data[0].lon),
        };
      }

      this.logger.warn(`No valid coordinates found for address: ${address}`);
      return null;
    } catch (error) {
      this.logger.error(
        `Geocoding error for address ${address}:`,
        error.message,
      );
      return null;
    }
  }

  /**
   * Verifies coordinates or safely falls back using the database registered address.
   * If both fail (meaning user blocks tracking AND the string address is missing/invalid),
   * this will return null.
   */
  async verifyAndFallbackCoordinates(
    userId: string,
    role: string,
    activeLat?: number,
    activeLon?: number,
  ): Promise<{ latitude: number; longitude: number } | null> {
    // 1. If active coordinates exist and are valid numbers, trust them immediately
    if (
      activeLat !== undefined &&
      activeLon !== undefined &&
      !isNaN(activeLat) &&
      !isNaN(activeLon)
    ) {
      return { latitude: activeLat, longitude: activeLon };
    }

    this.logger.log(
      `Active coordinates missing for User ${userId}. Falling back to registered address.`,
    );

    // 2. Lookup the user's registered address from the database based on role
    let registeredAddress: string | null = null;
    let fallbackCoords: { latitude: number; longitude: number } | null = null;

    if (role === 'PATIENT') {
      const patient = await this.prisma.patient.findUnique({
        where: { userId },
        select: { address: true },
      });
      registeredAddress = patient?.address || null;
    } else if (role === 'PHARMACY') {
      const pharmacy = await this.prisma.pharmacy.findUnique({
        where: { userId },
        select: { address: true, latitude: true, longitude: true },
      });
      // If pharmacy already has hardcoded coordinates mapped in the DB, use those
      if (pharmacy?.latitude && pharmacy?.longitude) {
        return { latitude: pharmacy.latitude, longitude: pharmacy.longitude };
      }
      registeredAddress = pharmacy?.address || null;
    } else if (role === 'BRANCH_MANAGER') {
      // Branch manager's main branch
      const branch = await this.prisma.branch.findFirst({
        where: { managerId: userId },
        select: { address: true, latitude: true, longitude: true },
      });
      if (branch?.latitude && branch?.longitude) {
        return { latitude: branch.latitude, longitude: branch.longitude };
      }
      registeredAddress = branch?.address || null;
    }

    // 3. Perform geocoding if we successfully extracted a string address
    if (registeredAddress) {
      fallbackCoords = await this.geocodeAddress(registeredAddress);
    }

    if (!fallbackCoords) {
      this.logger.warn(
        `Verification failed: User ${userId} has no active coordinates and no valid registered address.`,
      );
      // Return null to signify that triangulation/delivery cannot be fulfilled
      return null;
    }

    return fallbackCoords;
  }
}
