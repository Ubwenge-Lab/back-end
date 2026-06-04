import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, HttpStatus } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Analytics Multi-Role Dashboards (E2E)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  // Authentication bypass / Mock tokens
  let superAdminToken: string;
  let hospitalAdminAToken: string;
  let pharmacyToken: string;

  // Track entities
  let hospitalAId: string;
  let hospitalBId: string;
  let pharmacyId: string;
  let doctorId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    prisma = moduleFixture.get<PrismaService>(PrismaService);
    await seedAnalyticsEnvironment();
  });

  async function seedAnalyticsEnvironment() {
    // Clean database tables cleanly in structural hierarchy dependency order
    await prisma.medication.deleteMany({});
    await prisma.order.deleteMany({});
    await prisma.prescription.deleteMany({});
    await prisma.appointment.deleteMany({});
    await prisma.doctor.deleteMany({});
    await prisma.hospitalInvoice.deleteMany({});
    await prisma.hospital.deleteMany({});
    await prisma.pharmacy.deleteMany({});
    await prisma.user.deleteMany({});

    // 1. Create Base Multi-Tenant Users
    const uSuper = await prisma.user.create({ data: { email: 'super@platform.com', password: 'hash', role: 'SUPER_ADMIN' } });
    const uHospAdminA = await prisma.user.create({ data: { email: 'admin@hospa.com', password: 'hash', role: 'HOSPITAL_ADMIN' } });
    const uHospAdminB = await prisma.user.create({ data: { email: 'admin@hospb.com', password: 'hash', role: 'HOSPITAL_ADMIN' } });
    const uPharmOwner = await prisma.user.create({ data: { email: 'owner@pharma.com', password: 'hash', role: 'PHARMACY' } });
    const uDoc = await prisma.user.create({ data: { email: 'doctor@hospa.com', password: 'hash', role: 'DOCTOR' } });

    // 2. Setup Establishments
    const hospA = await prisma.hospital.create({
      data: { name: 'Kigali Central Hospital', address: 'KN 4 Ave', phone: '250781', userId: uHospAdminA.id },
    });
    hospitalAId = hospA.id;

    const hospB = await prisma.hospital.create({
      data: { name: 'Gisenyi District Hospital', address: 'Gen 3 St', phone: '250782', userId: uHospAdminB.id },
    });
    hospitalBId = hospB.id;

    const pharm = await prisma.pharmacy.create({
      data: { name: 'Nyargenge Pharmacy', address: 'KN 12 St', phone: '250783', status: 'APPROVED', userId: uPharmOwner.id },
    });
    pharmacyId = pharm.id;

    const pharmBranch = await prisma.branch.create({
      data: {
        name: 'Nyargenge Main Branch',
        address: 'KN 12 St',
        phone: '250784',
        pharmacy: { connect: { id: pharmacyId } },
      },
    });

    // 3. Setup Entities & Data for Hospital A
    const doc = await prisma.doctor.create({
      data: {
        user: { connect: { id: uDoc.id } },
        hospital: { connect: { id: hospitalAId } },
        firstName: 'Patrick',
        lastName: 'N',
        specialization: 'Cardiology',
        rating: 4.8,
        licenseNumber: 'DOC-1001',
      },
    });
    doctorId = doc.id;

    // Seed low-stock inventory warnings
    await prisma.medication.create({
      data: {
        pharmacy: { connect: { id: pharmacyId } },
        branch: { connect: { id: pharmBranch.id } },
        name: 'Paracetamol 500mg',
        quantity: 5,
        lowStockThreshold: 20,
        price: 50,
      },
    });

    // Simulated Access Tokens mapping
    superAdminToken = `Bearer MOCK_JWT_SUB_${uSuper.id}_ROLE_SUPER_ADMIN`;
    hospitalAdminAToken = `Bearer MOCK_JWT_SUB_${uHospAdminA.id}_ROLE_HOSPITAL_ADMIN`;
    pharmacyToken = `Bearer MOCK_JWT_SUB_${uPharmOwner.id}_ROLE_PHARMACY`;
  }

  // =========================================================================
  // TEST SUITE 1: SUPER ADMIN GLOBAL METRICS
  // =========================================================================
  describe('GET /api/analytics/super-admin', () => {
    it('should grant access to platform-wide metrics for SUPER_ADMIN users', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/analytics/super-admin')
        .set('Authorization', superAdminToken)
        .expect(HttpStatus.OK);

      expect(res.body).toHaveProperty('platform');
      expect(res.body.platform.totalHospitals).toBeGreaterThanOrEqual(2);
    });

    it('should explicitly block standard unit admins from reaching global metrics', async () => {
      await request(app.getHttpServer())
        .get('/api/analytics/super-admin')
        .set('Authorization', hospitalAdminAToken)
        .expect(HttpStatus.FORBIDDEN);
    });
  });

  // =========================================================================
  // TEST SUITE 2: HOSPITAL ANALYTICS MULTI-TENANCY GUARD
  // =========================================================================
  describe('GET /api/analytics/hospital/:id', () => {
    it('should permit a hospital admin to access their own metrics context', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/analytics/hospital/${hospitalAId}`)
        .set('Authorization', hospitalAdminAToken)
        .expect(HttpStatus.OK);

      expect(res.body).toHaveProperty('staffing');
      expect(res.body).toHaveProperty('operations');
    });

    it('should isolate boundaries and reject a hospital admin reading a rival instance metrics', async () => {
      await request(app.getHttpServer())
        .get(`/api/analytics/hospital/${hospitalBId}`) // Trying to read Hospital B metrics using Hospital A token
        .set('Authorization', hospitalAdminAToken)
        .expect(HttpStatus.FORBIDDEN);
    });
  });

  // =========================================================================
  // TEST SUITE 3: PHARMACY INVENTORY & SALES WARNINGS
  // =========================================================================
  describe('GET /api/analytics/pharmacy/:id', () => {
    it('should generate low stock metrics arrays gracefully', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/analytics/pharmacy/${pharmacyId}`)
        .set('Authorization', pharmacyToken)
        .expect(HttpStatus.OK);

      expect(res.body.inventory.totalLowStockItems).toBe(1);
      expect(res.body.inventory.warnings[0].name).toBe('Paracetamol 500mg');
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await app.close();
  });
});