import { Test, TestingModule } from '@nestjs/testing';
import { TriangulationService } from './triangulation.service';
import { PrismaService } from '../prisma/prisma.service';
import { LocationService } from '../location/location.service';
import { getDistrict } from './triangulation.helpers';

describe('getDistrict()', () => {
  it('should return Gasabo for Kimironko address', () => {
    expect(
      getDistrict(-1.9412, 30.1092, 'KG 11 Ave, Kimironko, Gasabo, Kigali'),
    ).toBe('Gasabo');
  });

  it('should return Gasabo for Remera address', () => {
    expect(
      getDistrict(-1.9559, 30.1125, 'KG 9 Ave, Remera, Gasabo, Kigali'),
    ).toBe('Gasabo');
  });

  it('should return Nyarugenge for City Centre address', () => {
    expect(
      getDistrict(-1.95, 30.0588, 'KN 3 Rd, City Centre, Nyarugenge, Kigali'),
    ).toBe('Nyarugenge');
  });

  it('should return Kicukiro for southern Kigali coordinates with no district in address', () => {
    expect(getDistrict(-1.973267, 30.126526, 'KK 246 ST')).toBe('Kicukiro');
  });

  it('should return Other for coordinates outside Kigali', () => {
    expect(getDistrict(-2.5, 29.5)).toBe('Other');
  });

  it('should prioritize address over coordinates when address contains district name', () => {
    expect(
      getDistrict(-1.9559, 30.1125, 'KG 9 Ave, Remera, Gasabo, Kigali'),
    ).toBe('Gasabo');
  });

  it('should fallback to coordinates when address has no district name', () => {
    expect(getDistrict(-1.973267, 30.126526, 'KK 246 ST')).toBe('Kicukiro');
  });
});

describe('TriangulationService', () => {
  let service: TriangulationService;
  let locationService: jest.Mocked<LocationService>;

  const mockPharmacies = [
    {
      id: 'pharmacy-1',
      name: 'Test Pharmacy',
      address: 'KN 5 Ave, Nyarugenge, Kigali',
      latitude: -1.9441,
      longitude: 30.0619,
      status: 'APPROVED',
      branches: [
        {
          id: 'branch-1',
          name: 'Test Main Branch',
          address: 'KN 5 Ave, Nyarugenge, Kigali',
          latitude: -1.9441,
          longitude: 30.0619,
          isActive: true,
          branchStatus: 'APPROVED',
        },
      ],
    },
  ];

  const mockPatients = [
    {
      id: 'patient-1',
      address: 'KN 5 Ave, Nyarugenge, Kigali',
      lastLat: -1.944,
      lastLng: 30.062,
      user: { id: 'user-1' },
    },
    {
      id: 'patient-2',
      address: 'KG 11 Ave, Kimironko, Gasabo, Kigali',
      lastLat: null,
      lastLng: null,
      user: { id: 'user-2' },
    },
  ];

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TriangulationService,
        {
          provide: PrismaService,
          useValue: {
            pharmacy: { findMany: jest.fn().mockResolvedValue(mockPharmacies) },
            patient: { findMany: jest.fn().mockResolvedValue(mockPatients) },
          },
        },
        {
          provide: LocationService,
          useValue: {
            verifyAndFallbackCoordinates: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<TriangulationService>(TriangulationService);
    locationService = module.get(LocationService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should return correct response structure', async () => {
    locationService.verifyAndFallbackCoordinates
      .mockResolvedValueOnce({ latitude: -1.944, longitude: 30.062 })
      .mockResolvedValueOnce({ latitude: -1.9412, longitude: 30.1092 });

    const result = await service.getMapData({ view: 'all', district: 'all' });

    expect(result).toHaveProperty('generatedAt');
    expect(result).toHaveProperty('totalPharmacies');
    expect(result).toHaveProperty('totalBranches');
    expect(result).toHaveProperty('totalPatientsMapped');
    expect(result).toHaveProperty('filters');
    expect(result).toHaveProperty('districts');
    expect(Array.isArray(result.districts)).toBe(true);
  });

  it('should label patient with lastLat/lastLng as LIVE_GPS', async () => {
    locationService.verifyAndFallbackCoordinates
      .mockResolvedValueOnce({ latitude: -1.944, longitude: 30.062 })
      .mockResolvedValueOnce({ latitude: -1.9412, longitude: 30.1092 });

    const result = await service.getMapData({ view: 'all', district: 'all' });
    const allPatients = result.districts.flatMap((d: any) =>
      d.branches.flatMap((b: any) => b.nearbyPatients),
    );

    const livePatient = allPatients.find(
      (p: any) => p.patientId === 'patient-1',
    );
    if (livePatient) {
      expect(livePatient.locationSource).toBe('LIVE_GPS');
    }
  });

  it('should label patient without lastLat/lastLng as FIXED_FALLBACK', async () => {
    locationService.verifyAndFallbackCoordinates
      .mockResolvedValueOnce({ latitude: -1.944, longitude: 30.062 })
      .mockResolvedValueOnce({ latitude: -1.9412, longitude: 30.1092 });

    const result = await service.getMapData({ view: 'all', district: 'all' });
    const allPatients = result.districts.flatMap((d: any) =>
      d.branches.flatMap((b: any) => b.nearbyPatients),
    );

    const fallbackPatient = allPatients.find(
      (p: any) => p.patientId === 'patient-2',
    );
    if (fallbackPatient) {
      expect(fallbackPatient.locationSource).toBe('FIXED_FALLBACK');
    }
  });

  it('should skip patient when coordinates cannot be resolved', async () => {
    locationService.verifyAndFallbackCoordinates
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);

    const result = await service.getMapData({ view: 'all', district: 'all' });
    expect(result.totalPatientsMapped).toBe(0);
  });

  it('should filter patients by view=live', async () => {
    locationService.verifyAndFallbackCoordinates
      .mockResolvedValueOnce({ latitude: -1.944, longitude: 30.062 })
      .mockResolvedValueOnce({ latitude: -1.9412, longitude: 30.1092 });

    const result = await service.getMapData({ view: 'live', district: 'all' });
    expect(result.totalPatientsMapped).toBe(1);
  });

  it('should filter patients by view=fixed', async () => {
    locationService.verifyAndFallbackCoordinates
      .mockResolvedValueOnce({ latitude: -1.944, longitude: 30.062 })
      .mockResolvedValueOnce({ latitude: -1.9412, longitude: 30.1092 });

    const result = await service.getMapData({ view: 'fixed', district: 'all' });
    expect(result.totalPatientsMapped).toBe(1);
  });

  it('should filter districts when district param is specified', async () => {
    locationService.verifyAndFallbackCoordinates
      .mockResolvedValueOnce({ latitude: -1.944, longitude: 30.062 })
      .mockResolvedValueOnce({ latitude: -1.9412, longitude: 30.1092 });

    const result = await service.getMapData({
      view: 'all',
      district: 'Nyarugenge',
    });
    expect(result.districts.length).toBe(1);
    expect(result.districts[0].name).toBe('Nyarugenge');
  });
});
