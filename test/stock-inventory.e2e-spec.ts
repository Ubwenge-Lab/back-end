import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request = require('supertest');
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';

describe('Stock Alerts and Disposals (e2e)', () => {
  jest.setTimeout(60000); // 60 seconds timeout for NestJS startup

  let app: INestApplication;
  let prisma: PrismaService;
  let jwtService: JwtService;
  let adminToken: string;
  let adminId: string;
  let hospitalId: string;
  let consumableId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.init();

    prisma = app.get<PrismaService>(PrismaService);
    jwtService = app.get<JwtService>(JwtService);

    // Setup Test Data
    const user = await prisma.user.create({
      data: {
        email: 'inventory.admin@test.com',
        password: 'hashedpassword',
        firstName: 'Admin',
        lastName: 'Test',
        role: 'HOSPITAL_ADMIN',
        isActive: true,
      },
    });
    adminId = user.id;

    const hospital = await prisma.hospital.create({
      data: {
        name: 'Test Inventory Hospital',
        address: '123 Health St',
        phone: '123456789',
        latitude: 0,
        longitude: 0,
        userId: user.id,
      },
    });
    hospitalId = hospital.id;

    await prisma.hospitalStaff.create({
      data: {
        userId: adminId,
        hospitalId: hospital.id,
        firstName: 'Admin',
        lastName: 'Test',
      },
    });

    const consumable = await prisma.hospitalConsumableStock.create({
      data: {
        hospitalId: hospital.id,
        itemName: 'Test Gloves',
        quantity: 100,
        criticalThreshold: 20,
      },
    });
    consumableId = consumable.id;

    adminToken = jwtService.sign({ sub: user.id, email: user.email, role: user.role });
  });

  afterAll(async () => {
    await prisma.disposalLog.deleteMany({ where: { authorizedBy: adminId } });
    await prisma.hospitalConsumableStock.deleteMany({ where: { hospitalId: hospitalId } });
    await prisma.hospitalStaff.deleteMany({ where: { userId: adminId } });
    await prisma.hospital.delete({ where: { id: hospitalId } });
    await prisma.user.delete({ where: { id: adminId } });
    await app.close();
  });

  describe('/inventory/disposal (POST)', () => {
    it('should successfully log disposal and deduct stock', async () => {
      const payload = {
        itemId: consumableId,
        itemName: 'Test Gloves',
        itemType: 'Hospital Consumable',
        quantity: 10,
        method: 'Expired - Incinerated',
        notes: 'Expired last month',
      };

      const res = await request(app.getHttpServer())
        .post('/inventory/disposal')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(payload)
        .expect(201);

      // Verify log was created
      expect(res.body.itemId).toBe(consumableId);
      expect(res.body.quantity).toBe(10);
      expect(res.body.method).toBe('Expired - Incinerated');

      // Verify stock was deducted
      const stock = await prisma.hospitalConsumableStock.findUnique({
        where: { id: consumableId },
      });
      expect(stock?.quantity).toBe(90); // 100 - 10
    });

    it('should fail if requested quantity is more than available', async () => {
      const payload = {
        itemId: consumableId,
        itemName: 'Test Gloves',
        itemType: 'Hospital Consumable',
        quantity: 200, // more than the 90 available
        method: 'Damaged',
      };

      await request(app.getHttpServer())
        .post('/inventory/disposal')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(payload)
        .expect(400); // BadRequestException
    });

    it('should fail if item type is invalid', async () => {
      const payload = {
        itemId: consumableId,
        itemName: 'Test Gloves',
        itemType: 'Invalid Type', // Validation should catch this
        quantity: 10,
        method: 'Damaged',
      };

      await request(app.getHttpServer())
        .post('/inventory/disposal')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(payload)
        .expect(400);
    });
  });
});
