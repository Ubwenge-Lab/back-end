import { Test, TestingModule } from '@nestjs/testing';
import { TriangulationController } from './triangulation.controller';

describe('TriangulationController', () => {
  let controller: TriangulationController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TriangulationController],
    }).compile();

    controller = module.get<TriangulationController>(TriangulationController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
