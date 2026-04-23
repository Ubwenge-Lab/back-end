export type DistrictName = 'Gasabo' | 'Kicukiro' | 'Nyarugenge' | 'Other';

export interface BoundingBox {
  latMin: number;
  latMax: number;
  lngMin: number;
  lngMax: number;
}

export const DISTRICT_BOUNDS: Record<Exclude<DistrictName, 'Other'>, BoundingBox> = {
  Nyarugenge: { latMin: -1.975, latMax: -1.930, lngMin: 30.030, lngMax: 30.075 },
  Gasabo:     { latMin: -1.955, latMax: -1.870, lngMin: 30.070, lngMax: 30.200 },
  Kicukiro:   { latMin: -2.020, latMax: -1.955, lngMin: 30.070, lngMax: 30.170 },
};

export const PROXIMITY_RADIUS_KM = 3;

