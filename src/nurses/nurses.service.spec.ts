import { Test, TestingModule } from '@nestjs/testing';
import { NursesService } from './nurses.service';
import { PrismaService } from '../prisma/prisma.service';

describe('NursesService', () => {
  let service: NursesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NursesService,
        {
          provide: PrismaService,
          useValue: {
            hospitalStaff: { findUnique: jest.fn() },
            appointment: { count: jest.fn() },
            inpatientAdmission: { count: jest.fn() },
          },
        },
      ],
    }).compile();

    service = module.get<NursesService>(NursesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
