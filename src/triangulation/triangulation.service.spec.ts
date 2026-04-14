import { Test, TestingModule } from '@nestjs/testing';
import { TriangulationService } from './triangulation.service';

describe('TriangulationService', () => {
  let service: TriangulationService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [TriangulationService],
    }).compile();

    service = module.get<TriangulationService>(TriangulationService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
