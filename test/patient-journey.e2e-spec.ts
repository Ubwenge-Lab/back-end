import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, HttpStatus } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { UserRole } from '@prisma/client';

describe('End-to-End Patient Journey Smoke Test (e2e)', () => {
  jest.setTimeout(60000);
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let jwtService: JwtService;

  // Test state variables to pass IDs between steps
  let patientUser: any;
  let doctorUser: any;
  let hospitalId: string;
  let doctorId: string;
  let patientToken: string;
  let doctorToken: string;
  let appointmentId: string;

  beforeAll(async () => {
    console.log('🚀 Booting up NestJS for E2E Test...');
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();

    prisma = app.get(PrismaService);
    jwtService = app.get(JwtService);

    // 1. Clean up old test data to ensure a pristine state
    await prisma.appointment.deleteMany({
      where: { reason: { startsWith: 'E2E_TEST_' } },
    });

    // 2. Fetch existing entities from DB (or create them if needed)
    // For this smoke test, we'll grab the first available DOCTOR and PATIENT
    doctorUser = await prisma.user.findFirst({
      where: { role: UserRole.DOCTOR },
      include: { doctor: true },
    });
    
    patientUser = await prisma.user.findFirst({
      where: { role: UserRole.PATIENT },
      include: { patient: true },
    });

    if (!doctorUser || !patientUser) {
      throw new Error('❌ Missing required seed data (Doctor or Patient) for E2E test.');
    }

    doctorId = doctorUser.doctor.id;
    hospitalId = doctorUser.doctor.hospitalId;

    // 3. Manually generate JWT Tokens to act as these users
    doctorToken = await jwtService.signAsync({
      sub: doctorUser.id,
      email: doctorUser.email,
      role: UserRole.DOCTOR,
      hospitalId: hospitalId,
    });

    patientToken = await jwtService.signAsync({
      sub: patientUser.id,
      email: patientUser.email,
      role: UserRole.PATIENT,
    });
  });

  afterAll(async () => {
    // Clean up the appointment we made
    if (appointmentId) {
      await prisma.appointment.deleteMany({
        where: { id: appointmentId },
      });
    }
    await app.close();
  });

  it('1. [QUEUE] Patient successfully books an appointment', async () => {
    // Patient checks in / books slot
    const bookPayload = {
      doctorId: doctorId,
      date: new Date(Date.now() + 86400000).toISOString(), // Tomorrow
      reason: 'E2E_TEST_Chest_Pain',
    };

    const response = await request(app.getHttpServer())
      .post('/api/appointments/book')
      .set('Authorization', `Bearer ${patientToken}`)
      .send(bookPayload);

    expect(response.status).toBe(HttpStatus.CREATED);
    expect(response.body.appointment).toHaveProperty('id');
    
    // Save this ID for the next steps in the journey!
    appointmentId = response.body.appointment.id;
  });

  it('2. [CONSULTATION] Doctor marks appointment as completed & auto-bills', async () => {
    // Doctor completes the consultation and adds line items for billing
    const consultPayload = {
      items: [
        {
          description: 'E2E_TEST_General_Checkup_Fee',
          quantity: 1,
          unitCost: 15000,
        },
      ],
      diagnosisSummary: 'E2E_TEST_Patient_is_healthy',
      notes: 'E2E_TEST_Routine_clearance',
    };

    const response = await request(app.getHttpServer())
      .post(`/api/appointments/${appointmentId}/consult`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .send(consultPayload);

    expect(response.status).toBe(HttpStatus.OK);
    
    // The endpoint should have updated the appointment status to COMPLETED
    const dbAppointment = await prisma.appointment.findUnique({
      where: { id: appointmentId },
    });
    expect(dbAppointment?.status).toBe('COMPLETED');
  });

  it('3. [BILLING] Invoice is correctly generated for the consultation', async () => {
    // Check if the auto-billing worked during the consult
    const invoice = await prisma.hospitalInvoice.findFirst({
      where: { appointmentId: appointmentId },
      include: { items: true },
    });

    expect(invoice).toBeDefined();
    
    // Ensure the fee we added in step 2 is present on the invoice
    expect(invoice?.items.some(i => i.description === 'E2E_TEST_General_Checkup_Fee')).toBeTruthy();
  });

  it('4. [DASHBOARD] Doctor views live dashboard and sees updated stats', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/doctors/dashboard')
      .set('Authorization', `Bearer ${doctorToken}`);

    expect(response.status).toBe(HttpStatus.OK);
    expect(response.body).toHaveProperty('completedConsults');
    // Since we just completed an appointment, completedConsults should be >= 1
    expect(response.body.completedConsults).toBeGreaterThanOrEqual(1);
  });

  it('5. [PATIENT LIST] Doctor views scoped patient list and finds their patient', async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/hospitals/${hospitalId}/patients`)
      .set('Authorization', `Bearer ${doctorToken}`);

    expect(response.status).toBe(HttpStatus.OK);
    expect(Array.isArray(response.body)).toBe(true);
    
    // The patient we just treated should be in this list
    const patientIds = response.body.map((p: any) => p.id);
    expect(patientIds).toContain(patientUser.patient.id);
  });
});
