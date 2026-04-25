import { Test, TestingModule } from '@nestjs/testing';
import { TriangulationController } from './triangulation.controller';
import { TriangulationService } from './triangulation.service';

describe('TriangulationController', () => {
  let controller: TriangulationController;
  let service: jest.Mocked<TriangulationService>;

  const mockMapDataResponse = {
    generatedAt: '2026-04-23T00:00:00.000Z',
    totalPharmacies: 2,
    totalBranches: 3,
    totalPatientsMapped: 5,
    filters: { view: 'all', district: 'all' },
    districts: [],
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TriangulationController],
      providers: [
        {
          provide: TriangulationService,
          useValue: {
            getNearbyBranches: jest.fn(),
            getGlobalCoordinates: jest.fn(),
            getMapData: jest.fn().mockResolvedValue(mockMapDataResponse),
          },
        },
      ],
    }).compile();

    controller = module.get<TriangulationController>(TriangulationController);
    service = module.get(TriangulationService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should call getMapData with query params', async () => {
    const query = { view: 'all' as const, district: 'all' as const };
    const result = await controller.getMapData(query);

    expect(service.getMapData).toHaveBeenCalledWith(query);
    expect(result).toEqual(mockMapDataResponse);
  });

  it('should call getMapData with district filter', async () => {
    const query = { view: 'all' as const, district: 'Gasabo' as const };
    await controller.getMapData(query);

    expect(service.getMapData).toHaveBeenCalledWith(query);
  });

  it('should call getMapData with view=live filter', async () => {
    const query = { view: 'live' as const, district: 'all' as const };
    await controller.getMapData(query);

    expect(service.getMapData).toHaveBeenCalledWith(query);
  });
});
