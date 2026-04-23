import { DISTRICT_BOUNDS, DistrictName } from './triangulation.constants';

export function getDistrict(lat: number, lng: number, address?: string): DistrictName {
  if (address) {
    const upper = address.toUpperCase();
    if (upper.includes('GASABO')) return 'Gasabo';
    if (upper.includes('KICUKIRO')) return 'Kicukiro';
    if (upper.includes('NYARUGENGE')) return 'Nyarugenge';
  }

  const priority: Array<Exclude<DistrictName, 'Other'>> = ['Nyarugenge', 'Gasabo', 'Kicukiro'];
  for (const name of priority) {
    const box = DISTRICT_BOUNDS[name];
    if (
      lat >= box.latMin &&
      lat <= box.latMax &&
      lng >= box.lngMin &&
      lng <= box.lngMax
    ) {
      return name;
    }
  }
  return 'Other';
}
