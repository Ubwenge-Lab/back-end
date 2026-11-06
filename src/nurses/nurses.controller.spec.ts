import { Test, TestingModule } from '@nestjs/testing';
import { NursesController } from './nurses.controller';
import { NursesService } from './nurses.service';

describe('NursesController', () => {
  let controller: NursesController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [NursesController],
      providers: [
        {
          provide: NursesService,
          useValue: {
            getDashboardStats: jest.fn().mockResolvedValue({
              totalPatients: 0,
              pendingTasks: 0,
              admittedPatients: 0,
              completedToday: 0,
            }),
          },
        },
      ],
    }).compile();

    controller = module.get<NursesController>(NursesController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
