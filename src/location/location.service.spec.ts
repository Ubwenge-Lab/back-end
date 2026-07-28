import { Test, TestingModule } from '@nestjs/testing';
import { LocationService } from './location.service';
import { HttpService } from '@nestjs/axios';
import { PrismaService } from '../prisma/prisma.service';

describe('LocationService', () => {
  let service: LocationService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LocationService,
        {
          provide: HttpService,
          useValue: {},
        },
        {
          provide: PrismaService,
          useValue: {},
        },
      ],
    }).compile();

    service = module.get<LocationService>(LocationService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
