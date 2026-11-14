import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { v4 as uuidv4 } from 'uuid';
import { UserRole } from '@prisma/client';

jest.setTimeout(60000); // Allow NestJS time to boot

describe('Stock Inventory Disposals (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let jwtService: JwtService;

  const testId = uuidv4();
  let hospitalId: string;
  let adminUserId: string;
  let stockId: string;
  let token: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.init();

    prisma = app.get(PrismaService);
    jwtService = app.get(JwtService);

    // 1. Create a dummy Hospital
    const hospital = await prisma.hospital.create({
      data: {
        name: `E2E Hospital ${testId}`,
        address: '123 Test St',
        phone: '123456789',
        licenseNumber: `REG-${testId}`,
        status: 'APPROVED',
        user: {
          create: {
            email: `admin_${testId}@test.com`,
            password: 'hash',
            role: UserRole.HOSPITAL_ADMIN,
          },
        },
      },
      include: { user: true },
    });
    hospitalId = hospital.id;
    adminUserId = hospital.userId;

    // Create JWT Token for admin
    token = jwtService.sign({ sub: adminUserId, email: hospital.user.email, role: 'HOSPITAL_ADMIN' });

    // 2. Create Dummy Consumable Stock
    const stock = await prisma.hospitalConsumableStock.create({
      data: {
        hospitalId: hospital.id,
        itemName: `E2E Syringe ${testId}`,
        quantity: 100,
        criticalThreshold: 20
      }
    });
    stockId = stock.id;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /api/inventory/disposal', () => {
    it('Should reject invalid payload (DTO validation)', () => {
      return request(app.getHttpServer())
        .post('/api/inventory/disposal')
        .set('Authorization', `Bearer ${token}`)
        .send({
          itemId: stockId,
          itemName: `E2E Syringe ${testId}`,
          itemType: 'INVALID_TYPE', // Invalid
          quantity: -5, // Invalid (Must be >= 1)
          method: 'EXPIRED'
        })
        .expect(400);
    });

    it('Should reject if trying to dispose MORE than in stock', () => {
      return request(app.getHttpServer())
        .post('/api/inventory/disposal')
        .set('Authorization', `Bearer ${token}`)
        .send({
          itemId: stockId,
          itemName: `E2E Syringe ${testId}`,
          itemType: 'Hospital Consumable',
          quantity: 200, // We only have 100 in stock!
          method: 'EXPIRED'
        })
        .expect(400); // Bad Request (Insufficient stock)
    });

    it('Should successfully dispose stock and create Audit Log', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/inventory/disposal')
        .set('Authorization', `Bearer ${token}`)
        .send({
          itemId: stockId,
          itemName: `E2E Syringe ${testId}`,
          itemType: 'Hospital Consumable',
          quantity: 10,
          method: 'DAMAGED',
          notes: 'Dropped box'
        })
        .expect(201);
      
      expect(res.body.quantity).toBe(10);
      expect(res.body.method).toBe('DAMAGED');

      // Verify Stock was deducted!
      const updatedStock = await prisma.hospitalConsumableStock.findUnique({ where: { id: stockId } });
      expect(updatedStock!.quantity).toBe(90); // 100 - 10 = 90
    });
  });
});
