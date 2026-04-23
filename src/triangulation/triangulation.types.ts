import { DistrictName } from './triangulation.constants';

export interface PatientMapPoint {
  patientId: string;
  coordinates: { lat: number; lng: number };
  locationSource: 'LIVE_GPS' | 'FIXED_FALLBACK';
  distanceKm: number;
}

export interface BranchMapPoint {
  id: string;
  name: string;
  address: string;
  coordinates: { lat: number; lng: number };
  pharmacyName: string;
  pharmacyId: string;
  isActive: boolean;
  nearbyPatientCount: number;
  nearbyPatients: PatientMapPoint[];
}

export interface PharmacyMapPoint {
  id: string;
  name: string;
  address: string;
  coordinates: { lat: number | null; lng: number | null };
  status: string;
  branchCount: number;
}

export interface DistrictGroup {
  name: DistrictName;
  pharmacies: PharmacyMapPoint[];
  branches: BranchMapPoint[];
  totalNearbyPatients: number;
}

export interface ResolvedPatient {
  patientId: string;
  lat: number;
  lng: number;
  locationSource: 'LIVE_GPS' | 'FIXED_FALLBACK';
}
