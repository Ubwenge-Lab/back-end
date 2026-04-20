import { pharmacyLocationDto } from "../dto/pharmacy_location.dto";
export function toPharmacyLocationDto(pharmacy: any, distanceKm?: number): pharmacyLocationDto {
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
    distance: distanceKm

  };
}
function mapRegion(pharmacy: any): string {
  return pharmacy.region ? String(pharmacy.region) : 'Kigali';
}
function getPharmacyStatus(hours: string): 'OPEN' | 'CLOSED' {
  if (!hours) return 'CLOSED';

  const [openTime, closedTime] = hours.split('-');
  if (!openTime || !closedTime) return 'CLOSED'

  const now = new Date();
  const [openHour, openMin] = openTime.split(':').map(Number);
  const openDate = new Date();
  openDate.setHours(openHour, openMin, 0);
  // Create Date objects for the closing time today
  const closeDate = new Date();
  const [closeHour, closeMin] = closedTime.split(':').map(Number);
  closeDate.setHours(closeHour, closeMin, 0);
  // Compare if the current time is inside the hours window
  if (now >= openDate && now <= closeDate) {
    return 'OPEN';
  }
  return 'CLOSED';
}





