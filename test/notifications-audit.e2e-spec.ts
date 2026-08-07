import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { v4 as uuidv4 } from 'uuid';
import { UserRole } from '@prisma/client';
import { correlationStorage } from '../src/logger/correlation.storage';

jest.setTimeout(60000); // Allow NestJS time to boot

describe('Notifications, Audit Logs, and Encryption (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let jwtService: JwtService;

  const testId = uuidv4();
  const testEmailPrefix = `e2e_test_${testId}`;
  let hospitalId: string;
  let adminUserId: string;
  let doctorUserId: string;
  let doctorId: string;
  let invoiceId: string;
  let medLogId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();

    prisma = app.get(PrismaService);
    jwtService = app.get(JwtService);

    // 1. Create a dummy Hospital
    const hospital = await prisma.hospital.create({
      data: {
        name: `E2E Test Hospital ${testId}`,
        address: '123 Test St',
        phone: '123456789',
        licenseNumber: `REG-${testId}`,
        status: 'APPROVED',
        user: {
          create: {
            email: `${testEmailPrefix}_admin@test.com`,
            password: 'hash',
            role: UserRole.HOSPITAL_ADMIN,
          },
        },
      },
      include: { user: true },
    });
    hospitalId = hospital.id;
    adminUserId = hospital.userId;

    // 2. Create a dummy Patient for relations
    const patientUser = await prisma.user.create({
      data: {
        email: `${testEmailPrefix}_patient@test.com`,
        password: 'hash',
        role: UserRole.PATIENT,
        patient: {
          create: {
            firstName: 'E2E',
            lastName: 'Patient',
            phone: '1234567890',
          }
        }
      },
      include: { patient: true }
    });
    const patientId = patientUser.patient!.id;

    // 3. Create a dummy Doctor
    const docUser = await prisma.user.create({
      data: {
        email: `${testEmailPrefix}_doc@test.com`,
        password: 'hash',
        role: UserRole.DOCTOR,
      },
    });
    doctorUserId = docUser.id;
    
    const doctor = await prisma.doctor.create({
      data: {
        userId: doctorUserId,
        hospitalId: hospital.id,
        specialization: 'General',
        licenseNumber: `DOC-LIC-${testId}`,
        firstName: 'E2E',
        lastName: 'Doc',
      }
    });
    doctorId = doctor.id;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('1. Cross-Role Notifications Access', () => {
    it('/api/notifications (GET) - Should reject unauthenticated requests', () => {
      return request(app.getHttpServer())
        .get('/api/notifications?userType=doctor')
        .expect(401);
    });

    it('/api/notifications (GET) - Should allow DOCTOR with valid token', async () => {
      const token = jwtService.sign({ sub: doctorUserId, email: `${testEmailPrefix}_doc@test.com`, role: 'DOCTOR' });
      const res = await request(app.getHttpServer())
        .get('/api/notifications?userType=doctor')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(Array.isArray(res.body)).toBeTruthy();
    });

    it('/api/notifications (GET) - Should allow HOSPITAL_ADMIN with valid token', async () => {
      const token = jwtService.sign({ sub: adminUserId, email: `${testEmailPrefix}_admin@test.com`, role: 'HOSPITAL_ADMIN' });
      const res = await request(app.getHttpServer())
        .get('/api/notifications?userType=hospital_admin')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(Array.isArray(res.body)).toBeTruthy();
    });
  });

  describe('2. Audit Log Hook Validation', () => {
    it('Should automatically generate an AuditLog when a HospitalInvoice is created', async () => {
      // Create a dummy invoice inside a Request Context so Audit Log fires
      const store: any = {
        userId: adminUserId,
        userRole: 'HOSPITAL_ADMIN',
        ipAddress: '127.0.0.1',
        actionReason: 'Automated E2E Testing'
      };

      await correlationStorage.run(store, async () => {
        const patient = await prisma.patient.findFirst({ where: { user: { email: { startsWith: testEmailPrefix } } } });
        
        const invoice = await prisma.invoice.create({
          data: {
            hospitalId: hospitalId,
            patientId: patient!.id,
            totalAmount: 5000.0,
            status: 'UNPAID',
            dueDate: new Date(),
          }
        });
        
        const hospitalPayment = await prisma.hospitalPayment.create({
          data: {
            invoiceId: invoice.id,
            patientId: patient!.id,
            amount: 5000.0,
            method: 'CASH',
            status: 'PENDING'
          }
        });
        invoiceId = hospitalPayment.id;
      });

      // Audit logs are created asynchronously via Promise.resolve().then()
      // We must wait a tiny bit for the hook to complete insertion
      await new Promise(r => setTimeout(r, 500));

      // Verify Audit Log was hooked and created automatically!
      const auditLog = await prisma.auditLog.findFirst({
        where: { targetId: invoiceId, targetType: 'HospitalPayment', action: 'WRITE' }
      });
      
      expect(auditLog).toBeDefined();
      expect(auditLog!.targetType).toBe('HospitalPayment');
      expect(auditLog!.action).toBe('WRITE');
    });
  });

  describe('3. Encryption Hook Validation (Raw DB Check)', () => {
    it('Should securely encrypt MedicalRecordLog fields in the raw database', async () => {
      const secretText = `TOP_SECRET_DIAGNOSIS_${testId}`;
      const patient = await prisma.patient.findFirst({ where: { user: { email: { startsWith: testEmailPrefix } } } });
      
      // 1. Save data via Prisma (Middleware encrypts it)
      const record = await prisma.medicalRecordLog.create({
        data: {
          patientId: patient!.id,
          doctorId: doctorId,
          reason: secretText, // This should be encrypted!
          accessType: 'VIEW'
        }
      });
      medLogId = record.id;

      // 2. Bypass Prisma and read RAW SQL ciphertext from DB
      const rawRecords: any[] = await prisma.$queryRaw`SELECT "reason" FROM "medical_record_logs" WHERE "id" = ${record.id}`;
      const rawDbValue = rawRecords[0].reason;
      
      // 3. Assertions
      expect(rawDbValue).not.toEqual(secretText); // Proves it's NOT plaintext in DB
      expect(rawDbValue).toMatch(/^([A-Za-z0-9+/=]+:)+/); // Proves it's an encrypted cipher format

      // 4. Fetch via Prisma (Middleware decrypts it)
      const fetched = await prisma.medicalRecordLog.findUnique({ where: { id: record.id } });
      expect(fetched!.reason).toEqual(secretText); // Proves it cleanly decrypts back to original!
    });
  });
});
