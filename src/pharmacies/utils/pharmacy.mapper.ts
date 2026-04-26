import { getDistrict } from "../../triangulation/triangulation.helpers";
import { PharmacyLocationDto } from "../dto/pharmacy_location.dto";

export function toPharmacyLocationDto(pharmacy: any, distanceKm?: number): PharmacyLocationDto {
  return {
    id: pharmacy.id,
    name: pharmacy.name,
    address: pharmacy.address,
    phone: pharmacy.phone,
    latitude: pharmacy.latitude,
    longitude: pharmacy.longitude,
    region: mapRegion(pharmacy),
    status: getPharmacyStatus(pharmacy.hours),
    hours: pharmacy.hours,
    isActive: pharmacy.isActive,
    rating: pharmacy.rating,
    distance: distanceKm,
  };
}
function mapRegion(pharmacy: any): string {
  if (pharmacy.region) return String(pharmacy.region);
  if (pharmacy.latitude && pharmacy.longitude) {
    return getDistrict(pharmacy.latitude, pharmacy.longitude, pharmacy.address);
  }
  return 'Unknown';
}
function getPharmacyStatus(hours: string): 'OPEN' | 'CLOSED' {
  if (!hours) return 'CLOSED';

  const [openTimeStr, closedTimeStr] = hours.split('-');
  if (!openTimeStr || !closedTimeStr) return 'CLOSED';

  const nowString = new Date().toLocaleString('en-US', {
    timeZone: 'Africa/Kigali',
  });
  const kigaliDate = new Date(nowString);

  const currentHour = kigaliDate.getHours();
  const currentMin = kigaliDate.getMinutes();

  const currentTotalMinutes = currentHour * 60 + currentMin;

  const [openHour, openMin] = openTimeStr.split(':').map(Number);
  const openTotalMinutes = openHour * 60 + openMin;

  const [closeHour, closeMin] = closedTimeStr.split(':').map(Number);
  const closeTotalMinutes = closeHour * 60 + closeMin;

  if (openTotalMinutes < closeTotalMinutes) {
    if (
      openTotalMinutes <= currentTotalMinutes &&
      currentTotalMinutes <= closeTotalMinutes
    ) {
      return 'OPEN';
    }
  } else {
    if (
      currentTotalMinutes >= openTotalMinutes ||
      currentTotalMinutes <= closeTotalMinutes
    ) {
      return 'OPEN';
    }
  }
  return 'CLOSED';
}
