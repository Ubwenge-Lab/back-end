import { Test, TestingModule } from '@nestjs/testing';
import { LabResultsController } from './lab-results.controller';
import { LabResultsService } from './lab-results.service';

describe('LabResultsController', () => {
  let controller: LabResultsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [LabResultsController],
      providers: [
        {
          provide: LabResultsService,
          useValue: {
            getQueue: jest.fn(),
            uploadResult: jest.fn(),
            updateStatus: jest.fn(),
            rejectOrder: jest.fn(),
            enterStructuredResult: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<LabResultsController>(LabResultsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
