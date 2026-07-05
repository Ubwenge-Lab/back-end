import { Test, TestingModule } from '@nestjs/testing';
import { StockTransfersController } from './stock-transfers.controller';
import { StockTransfersService } from './stock-transfers.service';

describe('StockTransfersController', () => {
  let controller: StockTransfersController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [StockTransfersController],
      providers: [
        {
          provide: StockTransfersService,
          useValue: {},
        },
      ],
    }).compile();

    controller = module.get<StockTransfersController>(StockTransfersController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
