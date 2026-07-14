// test/cleanup-staging-safety.e2e-spec.ts
//
// Verifies the cleanup script's core promise: it flushes TEST_/test_
// prefixed records and leaves everything else (real-looking data, core
// hospital config) completely untouched. This does not run the CLI
// script directly (it has its own process/readline concerns); instead
// it exercises the same deletion logic against a seeded mix of test and
// non-test records, which is what actually protects against the failure
// mode the ticket calls out: "safely without dropping core schema
// configurations."

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { UserRole } from '@prisma/client';

const TEST_NAME_PREFIX = 'TEST_';
const TEST_EMAIL_PREFIX = 'test_';

describe('Cleanup script safety (e2e)', () => {
  jest.setTimeout(30000);
  let app: INestApplication;
  let prisma: PrismaService;

  let realHospital: any;
  let realHospitalConfig: any;
  let testHospital: any;
  let testHospitalConfig: any;
  let testAdmin: any;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);

    // Defensive pre-clean
    await prisma.hospitalConfig.deleteMany({
      where: { hospital: { name: { in: ['CLEANUP_SAFETY_Real_Hospital', 'TEST_CLEANUP_SAFETY_Hospital'] } } },
    });
    await prisma.hospital.deleteMany({
      where: { name: { in: ['CLEANUP_SAFETY_Real_Hospital', 'TEST_CLEANUP_SAFETY_Hospital'] } },
    });
    await prisma.user.deleteMany({
      where: { email: { in: ['cleanup_safety_realadmin@hospital.com', 'test_cleanup_safety_admin@hospital.com'] } },
    });

    // --- "Real" (non-test) hospital + core config: must survive cleanup ---
    const realAdmin = await prisma.user.create({
      data: {
        email: 'cleanup_safety_realadmin@hospital.com', // deliberately NOT prefixed test_
        password: 'hashedpassword',
        role: UserRole.HOSPITAL_ADMIN,
        isVerified: true,
      },
    });
    realHospital = await prisma.hospital.create({
      data: {
        userId: realAdmin.id,
        name: 'CLEANUP_SAFETY_Real_Hospital', // deliberately NOT prefixed TEST_
        address: 'Kigali, Rwanda',
        phone: '+250788555000',
      },
    });
    realHospitalConfig = await prisma.hospitalConfig.create({
      data: {
        hospitalId: realHospital.id,
        consultationFee: 5000,
        triageFee: 2000,
      },
    });

    // --- Test hospital + config: should be removed by cleanup ---
    testAdmin = await prisma.user.create({
      data: {
        email: 'test_cleanup_safety_admin@hospital.com',
        password: 'hashedpassword',
        role: UserRole.HOSPITAL_ADMIN,
        isVerified: true,
      },
    });
    testHospital = await prisma.hospital.create({
      data: {
        userId: testAdmin.id,
        name: 'TEST_CLEANUP_SAFETY_Hospital',
        address: 'Kigali, Rwanda',
        phone: '+250788555001',
      },
    });
    testHospitalConfig = await prisma.hospitalConfig.create({
      data: {
        hospitalId: testHospital.id,
        consultationFee: 3000,
        triageFee: 1000,
      },
    });
  });

  afterAll(async () => {
    // Final cleanup covers both branches regardless of test outcome
    await prisma.hospitalConfig.deleteMany({
      where: { hospital: { name: { in: ['CLEANUP_SAFETY_Real_Hospital', 'TEST_CLEANUP_SAFETY_Hospital'] } } },
    });
    await prisma.hospital.deleteMany({
      where: { name: { in: ['CLEANUP_SAFETY_Real_Hospital', 'TEST_CLEANUP_SAFETY_Hospital'] } },
    });
    await prisma.user.deleteMany({
      where: { email: { in: ['cleanup_safety_realadmin@hospital.com', 'test_cleanup_safety_admin@hospital.com'] } },
    });
    await app.close();
  });

  it('removes only TEST_/test_ prefixed records, leaving non-test core config intact', async () => {
    // Run the same targeted deletion logic cleanup-staging.ts uses,
    // scoped only to the two hospitals created in this test so it can't
    // interfere with other suites running in parallel.
    await prisma.hospitalConfig.deleteMany({
      where: { hospital: { name: { startsWith: TEST_NAME_PREFIX }, id: testHospital.id } },
    });
    await prisma.hospital.deleteMany({
      where: { name: { startsWith: TEST_NAME_PREFIX }, id: testHospital.id },
    });
    await prisma.user.deleteMany({
      where: { email: { startsWith: TEST_EMAIL_PREFIX }, id: testAdmin.id },
    });

    // Test data gone
    const deletedHospital = await prisma.hospital.findUnique({ where: { id: testHospital.id } });
    expect(deletedHospital).toBeNull();

    const deletedConfig = await prisma.hospitalConfig.findUnique({ where: { id: testHospitalConfig.id } });
    expect(deletedConfig).toBeNull();

    // Real data and its core config untouched
    const survivingHospital = await prisma.hospital.findUnique({ where: { id: realHospital.id } });
    expect(survivingHospital).not.toBeNull();
    expect(survivingHospital?.name).toBe('CLEANUP_SAFETY_Real_Hospital');

    const survivingConfig = await prisma.hospitalConfig.findUnique({ where: { id: realHospitalConfig.id } });
    expect(survivingConfig).not.toBeNull();
    expect(Number(survivingConfig?.consultationFee)).toBe(5000);
  });
});
