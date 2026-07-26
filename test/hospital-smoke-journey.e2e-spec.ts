// test/hospital-smoke-journey.e2e-spec.ts
//
// ULTIMATE INTEGRATION SMOKE TEST
// Queue → Consultation → Labs → Billing → Pharmacy Checkout
//
// This walks one patient through the entire hospital flow in a single
// continuous suite, asserting each handoff before moving to the next
// stage. If any stage breaks, the failing `it` block tells you exactly
// which module regressed.
//
// Naming convention: every record created here is tagged with the
// TEST_SMOKE_ / test_smoke_ prefix so it can be safely identified and
// removed by scripts/cleanup-staging.ts without touching real data or
// core config (HospitalConfig, MedicationRegistry, etc.).

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { JwtService } from '@nestjs/jwt';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { UserRole, AppointmentStatus, DiagnosticStatus } from '@prisma/client';

describe('Hospital Smoke Journey (e2e): Queue → Consultation → Labs → Billing → Pharmacy Checkout', () => {
  jest.setTimeout(60000);

  let app: INestApplication<App>;
  let prisma: PrismaService;
  let jwtService: JwtService;

  // Actors
  let hospitalAdminUser: any;
  let hospital: any;
  let doctorUser: any;
  let doctor: any;
  let receptionistUser: any;
  let nurseUser: any;
  let technicianUser: any;
  let patientUser: any;
  let patient: any;
  let pharmacyOwnerUser: any;
  let pharmacy: any;
  let branchManagerUser: any;
  let branch: any;
  let medication: any;

  // Tokens
  let doctorToken: string;
  let receptionistToken: string;
  let nurseToken: string;
  let technicianToken: string;
  let patientToken: string;
  let cashierToken: string;

  // State carried between stages
  const journey: {
    appointmentId?: string;
    hospitalInvoiceId?: string;
    labOrderId?: string;
    orderId?: string;
    paymentId?: string;
  } = {};

  async function cleanupTestData() {
    // Children first, respecting FK direction (see cleanup-staging.ts for
    // the full explanation of ordering). Scoped tightly to this suite's
    // TEST_SMOKE_ prefix so it never touches real or unrelated test data.
    await prisma.prescription.deleteMany({
      where: { patient: { user: { email: { startsWith: 'test_smoke_' } } } },
    });
    await prisma.hospitalInvoice.deleteMany({
      where: { hospital: { name: { startsWith: 'TEST_SMOKE_' } } },
    });
    await prisma.appointment.deleteMany({
      where: { hospital: { name: { startsWith: 'TEST_SMOKE_' } } },
    });
    await prisma.diagnosticOrder.deleteMany({
      where: { patient: { user: { email: { startsWith: 'test_smoke_' } } } },
    });
    await prisma.orderItem.deleteMany({
      where: { order: { patient: { user: { email: { startsWith: 'test_smoke_' } } } } },
    });
    await prisma.payment.deleteMany({
      where: { order: { patient: { user: { email: { startsWith: 'test_smoke_' } } } } },
    });
    await prisma.order.deleteMany({
      where: { patient: { user: { email: { startsWith: 'test_smoke_' } } } },
    });
    await prisma.cartItem.deleteMany({
      where: { patient: { user: { email: { startsWith: 'test_smoke_' } } } },
    });
    await prisma.patient.deleteMany({
      where: { user: { email: { startsWith: 'test_smoke_' } } },
    });
    await prisma.hospitalStaff.deleteMany({
      where: { hospital: { name: { startsWith: 'TEST_SMOKE_' } } },
    });
    await prisma.doctor.deleteMany({
      where: { hospital: { name: { startsWith: 'TEST_SMOKE_' } } },
    });
    await prisma.hospital.deleteMany({
      where: { name: { startsWith: 'TEST_SMOKE_' } },
    });
    await prisma.medication.deleteMany({
      where: { branch: { name: { startsWith: 'TEST_SMOKE_' } } },
    });
    await prisma.branch.deleteMany({
      where: { name: { startsWith: 'TEST_SMOKE_' } },
    });
    await prisma.pharmacy.deleteMany({
      where: { name: { startsWith: 'TEST_SMOKE_' } },
    });
    await prisma.user.deleteMany({
      where: { email: { startsWith: 'test_smoke_' } },
    });
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    prisma = app.get(PrismaService);
    jwtService = app.get(JwtService);

    await cleanupTestData();

    // --- Hospital side ---
    hospitalAdminUser = await prisma.user.create({
      data: {
        email: 'test_smoke_hospitaladmin@hospital.com',
        password: 'hashedpassword',
        role: UserRole.HOSPITAL_ADMIN,
        isVerified: true,
      },
    });

    hospital = await prisma.hospital.create({
      data: {
        userId: hospitalAdminUser.id,
        name: 'TEST_SMOKE_Hospital',
        address: 'KG 7 Ave, Kigali, Rwanda',
        phone: '+250788000001',
      },
    });

    doctorUser = await prisma.user.create({
      data: {
        email: 'test_smoke_doctor@hospital.com',
        password: 'hashedpassword',
        role: UserRole.DOCTOR,
        isVerified: true,
      },
    });
    doctor = await prisma.doctor.create({
      data: {
        user: { connect: { id: doctorUser.id } },
        hospital: { connect: { id: hospital.id } },
        firstName: 'SmokeTest',
        lastName: 'Doctor',
        specialization: 'General Medicine',
        licenseNumber: 'TEST-SMOKE-LIC-1',
        isAvailable: true,
      },
    });

    receptionistUser = await prisma.user.create({
      data: {
        email: 'test_smoke_receptionist@hospital.com',
        password: 'hashedpassword',
        role: UserRole.RECEPTIONIST,
        isVerified: true,
      },
    });
    await prisma.hospitalStaff.create({
      data: {
        userId: receptionistUser.id,
        hospitalId: hospital.id,
        firstName: 'SmokeTest',
        lastName: 'Receptionist',
        department: 'Front Desk',
      },
    });

    nurseUser = await prisma.user.create({
      data: {
        email: 'test_smoke_nurse@hospital.com',
        password: 'hashedpassword',
        role: UserRole.NURSE,
        isVerified: true,
      },
    });
    await prisma.hospitalStaff.create({
      data: {
        userId: nurseUser.id,
        hospitalId: hospital.id,
        firstName: 'SmokeTest',
        lastName: 'Nurse',
        department: 'Triage',
      },
    });

    technicianUser = await prisma.user.create({
      data: {
        email: 'test_smoke_technician@hospital.com',
        password: 'hashedpassword',
        role: UserRole.TECHNICIAN,
        isVerified: true,
      },
    });

    // --- Patient ---
    patientUser = await prisma.user.create({
      data: {
        email: 'test_smoke_patient@patient.com',
        password: 'hashedpassword',
        role: UserRole.PATIENT,
        isVerified: true,
      },
    });
    patient = await prisma.patient.create({
      data: {
        userId: patientUser.id,
        firstName: 'SmokeTest',
        lastName: 'Patient',
        phone: '+250788000099',
        insuranceCoverage: 0, // no insurance → keeps billing path simple (UNPAID, not INSURANCE_PENDING)
      },
    });

    // --- Pharmacy side ---
    pharmacyOwnerUser = await prisma.user.create({
      data: {
        email: 'test_smoke_pharmacyowner@pharmacy.com',
        password: 'hashedpassword',
        role: UserRole.PHARMACY,
        isVerified: true,
      },
    });
    pharmacy = await prisma.pharmacy.create({
      data: {
        userId: pharmacyOwnerUser.id,
        name: 'TEST_SMOKE_Pharmacy',
        phone: '+250788000002',
        address: 'KN 4 Ave, Kigali, Rwanda',
        status: 'APPROVED',
      },
    });

    branchManagerUser = await prisma.user.create({
      data: {
        email: 'test_smoke_branchmanager@pharmacy.com',
        password: 'hashedpassword',
        role: UserRole.BRANCH_MANAGER,
        isVerified: true,
      },
    });
    branch = await prisma.branch.create({
      data: {
        pharmacyId: pharmacy.id,
        managerId: branchManagerUser.id,
        name: 'TEST_SMOKE_Branch_Main',
        address: 'KN 4 Ave, Kigali, Rwanda',
        phone: '+250788000003',
        isActive: true,
        status: 'APPROVED' as any,
      },
    });

    medication = await prisma.medication.create({
      data: {
        branchId: branch.id,
        pharmacyId: pharmacy.id,
        name: 'TEST_SMOKE_Paracetamol_500mg',
        price: 500,
        quantity: 100,
        requiresPrescription: false,
      },
    });

    // --- Tokens ---
    doctorToken = jwtService.sign({ sub: doctorUser.id, role: doctorUser.role });
    receptionistToken = jwtService.sign({ sub: receptionistUser.id, role: receptionistUser.role });
    nurseToken = jwtService.sign({ sub: nurseUser.id, role: nurseUser.role });
    technicianToken = jwtService.sign({ sub: technicianUser.id, role: technicianUser.role });
    patientToken = jwtService.sign({ sub: patientUser.id, role: patientUser.role });
    cashierToken = jwtService.sign({ sub: branchManagerUser.id, role: branchManagerUser.role });
  });

  afterAll(async () => {
    await cleanupTestData();
    await app.close();
  });

  // ==========================================================
  // STAGE 0: Patient books an appointment
  // ==========================================================
  describe('0. Booking', () => {
    it('patient books an appointment with the doctor', async () => {
      const res = await request(app.getHttpServer())
        .post('/appointments/book')
        .set('Authorization', `Bearer ${patientToken}`)
        .send({
          doctorId: doctor.id,
          date: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
          reason: 'Smoke test consultation',
          type: 'IN_PERSON',
        })
        .expect(201);

      expect(res.body.appointment?.id).toBeDefined();
      expect(res.body.appointment?.status).toBe(AppointmentStatus.SCHEDULED);
      journey.appointmentId = res.body.appointment.id;
    });
  });

  // ==========================================================
  // STAGE 1: QUEUE — Receptionist checks the patient in
  // ==========================================================
  describe('1. Queue (check-in)', () => {
    it('receptionist checks the patient in, moving SCHEDULED → ARRIVED', async () => {
      const res = await request(app.getHttpServer())
        .put(`/appointments/${journey.appointmentId}/check-in`)
        .set('Authorization', `Bearer ${receptionistToken}`)
        .expect(200);

      expect(res.body.status).toBe(AppointmentStatus.ARRIVED);
    });

    it('rejects a second check-in attempt (status guard)', async () => {
      await request(app.getHttpServer())
        .put(`/appointments/${journey.appointmentId}/check-in`)
        .set('Authorization', `Bearer ${receptionistToken}`)
        .expect(409);
    });

    it('nurse records triage vitals, moving ARRIVED → READY_FOR_DOCTOR', async () => {
      const res = await request(app.getHttpServer())
        .post(`/appointments/${journey.appointmentId}/triage`)
        .set('Authorization', `Bearer ${nurseToken}`)
        .send({
          bloodPressure: '120/80',
          temperature: 37.1,
          weight: 68,
          heartRate: 76,
          oxygenSaturation: 98,
          notes: 'Patient alert and oriented',
        })
        .expect(201);

      expect(res.body.status).toBe(AppointmentStatus.READY_FOR_DOCTOR);
    });
  });

  // ==========================================================
  // STAGE 2: CONSULTATION — Doctor completes consult, invoice generated
  // ==========================================================
  describe('2. Consultation', () => {
    it('doctor completes the consult and an invoice is generated', async () => {
      const res = await request(app.getHttpServer())
        .post(`/appointments/${journey.appointmentId}/consult`)
        .set('Authorization', `Bearer ${doctorToken}`)
        .send({
          diagnosisSummary: 'Acute pharyngitis',
          doctorRecommendations: 'Rest, fluids, review in 5 days',
          items: [
            { description: 'Consultation fee', quantity: 1, unitCost: 5000 },
            { description: 'Triage fee', quantity: 1, unitCost: 2000 },
          ],
        })
        .expect(200);

      expect(res.body.invoice?.id).toBeDefined();
      expect(Number(res.body.invoice?.totalAmount)).toBe(7000);
      expect(res.body.invoice?.paymentStatus).toBe('UNPAID');
      journey.hospitalInvoiceId = res.body.invoice.id;

      const appointment = await prisma.appointment.findUnique({
        where: { id: journey.appointmentId },
      });
      expect(appointment?.status).toBe(AppointmentStatus.COMPLETED);
    });
  });

  // ==========================================================
  // STAGE 3: LABS — Doctor orders test, technician reports findings
  // ==========================================================
  describe('3. Labs', () => {
    it('doctor requests a diagnostic order tied to the appointment', async () => {
      const res = await request(app.getHttpServer())
        .post('/diagnostics/orders')
        .set('Authorization', `Bearer ${doctorToken}`)
        .send({
          patientId: patient.id,
          appointmentId: journey.appointmentId,
          testType: 'BLOOD',
          icd10Code: 'J02.9',
        })
        .expect(201);

      expect(res.body.id).toBeDefined();
      expect(res.body.status).toBe(DiagnosticStatus.PENDING);
      journey.labOrderId = res.body.id;
    });

    it('the order appears in the technician queue', async () => {
      const res = await request(app.getHttpServer())
        .get('/diagnostics/queue')
        .set('Authorization', `Bearer ${technicianToken}`)
        .query({ status: DiagnosticStatus.PENDING })
        .expect(200);

      const ids = res.body.map((o: any) => o.id);
      expect(ids).toContain(journey.labOrderId);
    });

    it('technician reports findings and marks the order COMPLETED', async () => {
      const res = await request(app.getHttpServer())
        .put(`/diagnostics/orders/${journey.labOrderId}/findings`)
        .set('Authorization', `Bearer ${technicianToken}`)
        .send({
          status: DiagnosticStatus.COMPLETED,
          findings: 'No abnormalities detected',
          resultValue: 'WBC 6.2 x10^9/L',
        })
        .expect(200);

      expect(res.body.status).toBe(DiagnosticStatus.COMPLETED);
      expect(res.body.completedAt).toBeDefined();
    });
  });

  // ==========================================================
  // STAGE 4: BILLING — Hospital invoice is settled
  // ==========================================================
  describe('4. Billing', () => {
    it('settles the hospital invoice via the payment webhook', async () => {
      const res = await request(app.getHttpServer())
        .post('/payments/webhook/hospital')
        .send({
          invoiceId: journey.hospitalInvoiceId,
          status: 'SUCCESSFUL',
          transactionRef: 'TEST-SMOKE-TXN-001',
        })
        .expect(201);

      expect(res.body.status).toBe('success');

      const invoice = await prisma.hospitalInvoice.findUnique({
        where: { id: journey.hospitalInvoiceId },
      });
      expect(invoice?.paymentStatus).toBe('PAID');
    });
  });

  // ==========================================================
  // STAGE 5: PHARMACY CHECKOUT — Patient buys prescribed medication
  // ==========================================================
  describe('5. Pharmacy Checkout', () => {
    it('patient checks out an order for pickup, paying CASH', async () => {
      const res = await request(app.getHttpServer())
        .post('/payments/checkout')
        .set('Authorization', `Bearer ${patientToken}`)
        .send({
          pharmacyId: pharmacy.id,
          branchId: branch.id,
          type: 'PICKUP',
          items: [{ medicationId: medication.id, quantity: 2 }],
          paymentMethod: 'CASH',
        })
        .expect(201);

      expect(res.body.order?.id).toBeDefined();
      expect(res.body.payment?.paymentId).toBeDefined();
      journey.orderId = res.body.order.id;
      journey.paymentId = res.body.payment.paymentId;
    });

    it('cashier (branch manager) records the in-person cash payment, completing checkout', async () => {
      const order = await prisma.order.findUnique({ where: { id: journey.orderId } });

      const res = await request(app.getHttpServer())
        .post('/payments/record')
        .set('Authorization', `Bearer ${cashierToken}`)
        .send({
          orderId: journey.orderId,
          paymentMethod: 'CASH',
          amountReceived: order?.patientPayment ?? order?.total,
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.receiptNumber).toBeDefined();

      const payment = await prisma.payment.findUnique({ where: { orderId: journey.orderId } });
      expect(payment?.status).toBe('COMPLETED');

      const updatedOrder = await prisma.order.findUnique({ where: { id: journey.orderId } });
      expect(updatedOrder?.paymentStatus).toBe('COMPLETED');
    });
  });

  // ==========================================================
  // FULL JOURNEY SANITY CHECK
  // ==========================================================
  describe('6. End-to-end sanity check', () => {
    it('every stage produced the state the next stage depended on', () => {
      expect(journey.appointmentId).toBeDefined();
      expect(journey.hospitalInvoiceId).toBeDefined();
      expect(journey.labOrderId).toBeDefined();
      expect(journey.orderId).toBeDefined();
      expect(journey.paymentId).toBeDefined();
    });
  });
});