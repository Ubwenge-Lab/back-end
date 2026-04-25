export type DistrictName = 'Gasabo' | 'Kicukiro' | 'Nyarugenge' | 'Other';

export interface BoundingBox {
  latMin: number;
  latMax: number;
  lngMin: number;
  lngMax: number;
}

export const DISTRICT_BOUNDS: Record<
  Exclude<DistrictName, 'Other'>,
  BoundingBox
> = {
  Nyarugenge: { latMin: -1.975, latMax: -1.93, lngMin: 30.03, lngMax: 30.075 },
  Gasabo: { latMin: -1.955, latMax: -1.87, lngMin: 30.07, lngMax: 30.2 },
  Kicukiro: { latMin: -2.02, latMax: -1.955, lngMin: 30.07, lngMax: 30.17 },
};

export const PROXIMITY_RADIUS_KM = 3;
