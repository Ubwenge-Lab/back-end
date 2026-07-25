/**
 * Patient Journey — End-to-End Smoke Test
 *
 * Covers the full hospital workflow in sequence:
 *   Book → Check-in → Triage → Labs order → Lab findings → Consultation → Billing → Prescription
 *
 * Uses a real DB connection (no mocks).  Run with:
 *   npm run test:e2e -- --testPathPattern=patient-journey
 *
 * All test records are prefixed with TEST_JOURNEY_ so the cleanup script can
 * safely purge them from staging without touching production data.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import {
  UserRole,
  AppointmentStatus,
  DiagnosticType,
  DiagnosticStatus,
} from '@prisma/client';

// ─── Timeout ────────────────────────────────────────────────────────────────
jest.setTimeout(120_000);

// ─── Prefix used by cleanup script ──────────────────────────────────────────
const PREFIX = 'TEST_JOURNEY_';
const EMAIL = (role: string) => `${PREFIX}${role}@e2e.test`.toLowerCase();

// ─── Shared state populated in beforeAll ────────────────────────────────────
let app: INestApplication<App>;
let prisma: PrismaService;
let jwt: JwtService;

// DB records
let hospital: any;
let doctorRecord: any;
let nurseStaff: any;
let receptionistStaff: any;
let patientRecord: any;

// JWT tokens
let patientToken: string;
let doctorToken: string;
let nurseToken: string;
let receptionistToken: string;
let technicianToken: string;
let adminToken: string;

// IDs produced during the journey
let appointmentId: string;
let diagnosticOrderId: string;
let invoiceId: string;
let prescriptionId: string;

// ─── Setup ───────────────────────────────────────────────────────────────────
beforeAll(async () => {
  const module: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  app = module.createNestApplication();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.init();

  prisma = app.get(PrismaService);
  jwt = app.get(JwtService);

  // ── 0. Wipe any leftover TEST_JOURNEY_ records from a previous crashed run ──
  await purgeTestData(prisma);

  // ── 1. Hospital admin ────────────────────────────────────────────────────────
  const adminUser = await prisma.user.create({
    data: {
      email: EMAIL('admin'),
      password: 'hashed',
      role: UserRole.HOSPITAL_ADMIN,
      isVerified: true,
    },
  });
  adminToken = jwt.sign({ sub: adminUser.id, role: adminUser.role });

  // ── 2. Hospital ──────────────────────────────────────────────────────────────
  hospital = await prisma.hospital.create({
    data: {
      userId: adminUser.id,
      name: `${PREFIX}General Hospital`,
      address: 'Kigali, Rwanda',
      phone: '+250780000001',
    },
  });

  // ── 3. Doctor ────────────────────────────────────────────────────────────────
  const doctorUser = await prisma.user.create({
    data: {
      email: EMAIL('doctor'),
      password: 'hashed',
      role: UserRole.DOCTOR,
      isVerified: true,
    },
  });
  doctorToken = jwt.sign({ sub: doctorUser.id, role: doctorUser.role });

  doctorRecord = await (prisma.doctor.create as any)({
    data: {
      user: { connect: { id: doctorUser.id } },
      hospital: { connect: { id: hospital.id } },
      firstName: 'Journey',
      lastName: 'Doctor',
      specialization: 'General Medicine',
      licenseNumber: `${PREFIX}LIC-001`,
      isAvailable: true,
    },
  });

  // ── 4. Nurse (HospitalStaff + NURSE role) ────────────────────────────────────
  const nurseUser = await prisma.user.create({
    data: {
      email: EMAIL('nurse'),
      password: 'hashed',
      role: UserRole.NURSE,
      isVerified: true,
    },
  });
  nurseToken = jwt.sign({ sub: nurseUser.id, role: nurseUser.role });

  nurseStaff = await prisma.hospitalStaff.create({
    data: {
      userId: nurseUser.id,
      hospitalId: hospital.id,
      firstName: 'Journey',
      lastName: 'Nurse',
    },
  });

  // ── 5. Receptionist (HospitalStaff + RECEPTIONIST role) ─────────────────────
  //    checkIn has @Roles commented out; assertHospitalStaff still requires a
  //    HospitalStaff row for the calling user's hospitalId.
  const receptionistUser = await prisma.user.create({
    data: {
      email: EMAIL('receptionist'),
      password: 'hashed',
      role: UserRole.RECEPTIONIST,
      isVerified: true,
    },
  });
  receptionistToken = jwt.sign({
    sub: receptionistUser.id,
    role: receptionistUser.role,
  });

  receptionistStaff = await prisma.hospitalStaff.create({
    data: {
      userId: receptionistUser.id,
      hospitalId: hospital.id,
      firstName: 'Journey',
      lastName: 'Receptionist',
    },
  });

  // ── 6. Technician ────────────────────────────────────────────────────────────
  const technicianUser = await prisma.user.create({
    data: {
      email: EMAIL('technician'),
      password: 'hashed',
      role: UserRole.TECHNICIAN,
      isVerified: true,
    },
  });
  technicianToken = jwt.sign({
    sub: technicianUser.id,
    role: technicianUser.role,
  });

  // ── 7. Patient ───────────────────────────────────────────────────────────────
  const patientUser = await prisma.user.create({
    data: {
      email: EMAIL('patient'),
      password: 'hashed',
      role: UserRole.PATIENT,
      isVerified: true,
    },
  });
  patientToken = jwt.sign({ sub: patientUser.id, role: patientUser.role });

  patientRecord = await prisma.patient.create({
    data: {
      userId: patientUser.id,
      firstName: 'Journey',
      lastName: 'Patient',
      phone: '+250780000099',
    },
  });

  // Register patient at hospital (needed for MRN-based lookups)
  await prisma.hospitalPatientRegistration.create({
    data: {
      patientId: patientRecord.id,
      hospitalId: hospital.id,
      mrn: `${PREFIX}MRN-001`,
    },
  });
});

// ─── Teardown ────────────────────────────────────────────────────────────────
afterAll(async () => {
  await purgeTestData(prisma);
  await app.close();
});

// ─── Journey Tests ────────────────────────────────────────────────────────────

describe('Step 1 — Patient books appointment', () => {
  it('POST /appointments/book → 201 SCHEDULED', async () => {
    const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const res = await request(app.getHttpServer())
      .post('/appointments/book')
      .set('Authorization', `Bearer ${patientToken}`)
      .send({
        doctorId: doctorRecord.id,
        date: futureDate,
        reason: 'E2E smoke test consultation',
        type: 'IN_PERSON',
      })
      .expect(201);

    // The booking endpoint wraps its response: { appointment: {...}, message: "..." }
    const apt = res.body.appointment ?? res.body;
    expect(apt).toHaveProperty('id');
    expect(apt.status).toBe(AppointmentStatus.SCHEDULED);
    expect(apt.patientId).toBe(patientRecord.id);
    expect(apt.doctorId).toBe(doctorRecord.id);
    expect(apt.hospitalId).toBe(hospital.id);

    appointmentId = apt.id;
  });
});

describe('Step 2 — Receptionist checks in patient', () => {
  it('PUT /appointments/:id/check-in → 200 ARRIVED', async () => {
    const res = await request(app.getHttpServer())
      .put(`/appointments/${appointmentId}/check-in`)
      .set('Authorization', `Bearer ${receptionistToken}`)
      .expect(200);

    expect(res.body.status).toBe(AppointmentStatus.ARRIVED);
  });

  it('PUT /appointments/:id/check-in again → 409 (already checked in)', async () => {
    await request(app.getHttpServer())
      .put(`/appointments/${appointmentId}/check-in`)
      .set('Authorization', `Bearer ${receptionistToken}`)
      .expect(409);
  });
});

describe('Step 3 — Nurse records triage vitals', () => {
  it('POST /appointments/:id/triage → 201 READY_FOR_DOCTOR', async () => {
    const res = await request(app.getHttpServer())
      .post(`/appointments/${appointmentId}/triage`)
      .set('Authorization', `Bearer ${nurseToken}`)
      .send({
        bloodPressure: '120/80',
        temperature: 36.6,
        weight: 70.0,
        heartRate: 72,
        oxygenSaturation: 98,
        notes: 'Patient is calm and cooperative.',
      })
      .expect(201);

    // After triage the appointment transitions to READY_FOR_DOCTOR
    const updated = await prisma.appointment.findUnique({
      where: { id: appointmentId },
    });
    expect(updated?.status).toBe(AppointmentStatus.READY_FOR_DOCTOR);

    // Vitals record exists
    const vitals = await prisma.triageVitals.findUnique({
      where: { appointmentId },
    });
    expect(vitals).not.toBeNull();
    expect(vitals?.bloodPressure).toBe('120/80');
    expect(vitals?.heartRate).toBe(72);
  });

  it('POST /appointments/:id/triage again → 409 (vitals already recorded)', async () => {
    await request(app.getHttpServer())
      .post(`/appointments/${appointmentId}/triage`)
      .set('Authorization', `Bearer ${nurseToken}`)
      .send({
        bloodPressure: '130/85',
        temperature: 37.0,
        weight: 71,
        heartRate: 80,
        oxygenSaturation: 97,
      })
      .expect(409);
  });
});

describe('Step 4 — Doctor orders a lab test (Diagnostics)', () => {
  it('POST /diagnostics/orders → 201 with PENDING status', async () => {
    const res = await request(app.getHttpServer())
      .post('/diagnostics/orders')
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({
        patientId: patientRecord.id,
        appointmentId,
        testType: DiagnosticType.BLOOD,
        icd10Code: 'Z00.00',
      })
      .expect(201);

    expect(res.body).toHaveProperty('id');
    expect(res.body.status).toBe(DiagnosticStatus.PENDING);
    expect(res.body.patientId).toBe(patientRecord.id);
    expect(res.body.testType).toBe(DiagnosticType.BLOOD);

    diagnosticOrderId = res.body.id;
  });

  it('GET /diagnostics/queue → 200 and includes the new order', async () => {
    const res = await request(app.getHttpServer())
      .get('/diagnostics/queue')
      .set('Authorization', `Bearer ${technicianToken}`)
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
    const found = res.body.find((o: any) => o.id === diagnosticOrderId);
    expect(found).toBeDefined();
  });
});

describe('Step 5 — Technician reports lab findings', () => {
  it('PUT /diagnostics/orders/:id/findings → 200 COMPLETED', async () => {
    const res = await request(app.getHttpServer())
      .put(`/diagnostics/orders/${diagnosticOrderId}/findings`)
      .set('Authorization', `Bearer ${technicianToken}`)
      .send({
        status: DiagnosticStatus.COMPLETED,
        findings: 'WBC normal. RBC within range. No abnormalities detected.',
        resultValue: 'WBC 7.2 × 10⁹/L',
      })
      .expect(200);

    expect(res.body.status).toBe(DiagnosticStatus.COMPLETED);
    expect(res.body.findings).toContain('WBC normal');
  });

  it('GET /diagnostics/patient/:patientId → 200 with completed order', async () => {
    const res = await request(app.getHttpServer())
      .get(`/diagnostics/patient/${patientRecord.id}`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
    const completed = res.body.find(
      (o: any) => o.id === diagnosticOrderId && o.status === DiagnosticStatus.COMPLETED,
    );
    expect(completed).toBeDefined();
  });
});

describe('Step 6 — Doctor completes consultation (auto-generates invoice)', () => {
  it('POST /appointments/:id/consult → 200 and invoice created', async () => {
    const res = await request(app.getHttpServer())
      .post(`/appointments/${appointmentId}/consult`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({
        diagnosisSummary: 'Acute upper respiratory tract infection',
        doctorRecommendations: 'Rest, fluids, and follow-up in 5 days.',
        items: [
          { description: 'Nebulisation therapy', quantity: 1, unitCost: 3000 },
        ],
        notes: 'Patient responded well during consult.',
      })
      .expect(200);

    // Appointment must now be COMPLETED
    const apt = await prisma.appointment.findUnique({
      where: { id: appointmentId },
    });
    expect(apt?.status).toBe(AppointmentStatus.COMPLETED);
    expect(apt?.diagnosisSummary).toBe('Acute upper respiratory tract infection');

    // Invoice must have been created
    const invoice = await prisma.hospitalInvoice.findUnique({
      where: { appointmentId },
    });
    expect(invoice).not.toBeNull();
    invoiceId = invoice!.id;
  });
});

describe('Step 7 — Billing: view and pay invoice', () => {
  it('GET /invoices/:id (patient) → 200 with invoice data', async () => {
    const res = await request(app.getHttpServer())
      .get(`/invoices/${invoiceId}`)
      .set('Authorization', `Bearer ${patientToken}`)
      .expect(200);

    expect(res.body).toHaveProperty('id', invoiceId);
    expect(res.body).toHaveProperty('totalAmount');
    expect(res.body.paymentStatus).toBe('UNPAID');
  });

  it('PATCH /invoices/:id/pay (admin) → 200 PAID', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/invoices/${invoiceId}/pay`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const payStatus = res.body.paymentStatus ?? res.body.invoice?.paymentStatus;
    if (payStatus) expect(payStatus).toBe('PAID');
  });

  it('GET /invoices/:id after payment → still 200 with PAID status', async () => {
    const res = await request(app.getHttpServer())
      .get(`/invoices/${invoiceId}`)
      .set('Authorization', `Bearer ${patientToken}`)
      .expect(200);

    expect(res.body.paymentStatus).toBe('PAID');
  });
});

describe('Step 8 — Doctor issues hospital prescription (Pharmacy Checkout)', () => {
  it('POST /prescriptions/hospital-issue → 201 APPROVED', async () => {
    const res = await request(app.getHttpServer())
      .post('/prescriptions/hospital-issue')
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({
        patientId: patientRecord.id,
        hospitalId: hospital.id,
        appointmentId,
        medications: [
          {
            name: 'Amoxicillin 500mg',
            dosage: '1 capsule',
            frequency: '3 times daily',
            duration: '7 days',
            quantity: 21,
          },
          {
            name: 'Paracetamol 500mg',
            dosage: '1–2 tablets',
            frequency: 'Every 6 hours as needed',
            duration: '5 days',
            quantity: 20,
          },
        ],
        refillsAllowed: 0,
      })
      .expect(201);

    expect(res.body).toHaveProperty('prescription');
    expect(res.body.prescription.status).toBe('APPROVED');
    expect(res.body.prescription.patientId).toBe(patientRecord.id);
    expect(res.body.prescription.hospitalId).toBe(hospital.id);

    prescriptionId = res.body.prescription.id;
  });

  it('GET /prescriptions/:id → 200 with medications list', async () => {
    const res = await request(app.getHttpServer())
      .get(`/prescriptions/${prescriptionId}`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .expect(200);

    expect(res.body).toHaveProperty('id', prescriptionId);
    // findById doesn't join prescriptionMedications in its SELECT — verify via DB instead
    const savedMeds = await prisma.prescriptionMedication.findMany({
      where: { prescriptionId },
    });
    expect(savedMeds.length).toBeGreaterThanOrEqual(2);
  });
});

describe('Guard and auth smoke checks', () => {
  it('POST /appointments/book without token → 401', async () => {
    await request(app.getHttpServer())
      .post('/appointments/book')
      .send({})
      .expect(401);
  });

  it('POST /appointments/:id/triage with DOCTOR token → 403 (wrong role)', async () => {
    await request(app.getHttpServer())
      .post(`/appointments/${appointmentId}/triage`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({
        bloodPressure: '115/75',
        temperature: 36.5,
        weight: 68,
        heartRate: 70,
        oxygenSaturation: 99,
      })
      .expect(403);
  });

  it('GET /diagnostics/queue with PATIENT token → 403 (wrong role)', async () => {
    await request(app.getHttpServer())
      .get('/diagnostics/queue')
      .set('Authorization', `Bearer ${patientToken}`)
      .expect(403);
  });

  it('PATCH /invoices/:id/pay with PATIENT token → 403', async () => {
    await request(app.getHttpServer())
      .patch(`/invoices/${invoiceId}/pay`)
      .set('Authorization', `Bearer ${patientToken}`)
      .expect(403);
  });
});

// ─── Cleanup helper ───────────────────────────────────────────────────────────

async function purgeTestData(db: PrismaService) {
  // Each step runs independently — a FK block on one step must not prevent
  // later steps from running, because Prisma schema cascades mean that
  // deleting a parent record often unblocks a previously stuck child delete.
  const swallow = async (fn: () => Promise<unknown>) => {
    try { await fn(); } catch { /* partial DB state from a previous crashed run */ }
  };

  const byHospital = { hospital: { name: { startsWith: PREFIX } } };
  const byUserEmail = { user: { email: { startsWith: PREFIX.toLowerCase() } } };

  await swallow(() => db.prescriptionMedication.deleteMany({ where: { prescription: byHospital } }));
  await swallow(() => db.prescription.deleteMany({ where: byHospital }));
  await swallow(() => db.diagnosticOrder.deleteMany({ where: { patient: byUserEmail } }));
  await swallow(() => db.hospitalInvoiceItem.deleteMany({ where: { invoice: byHospital } }));
  await swallow(() => db.hospitalInvoice.deleteMany({ where: byHospital }));
  await swallow(() => db.appointment.deleteMany({ where: byHospital }));
  await swallow(() => db.hospitalPatientRegistration.deleteMany({ where: byHospital }));
  await swallow(() => db.doctor.deleteMany({ where: byHospital }));
  await swallow(() => db.hospitalStaff.deleteMany({ where: byHospital }));
  await swallow(() => db.hospital.deleteMany({ where: { name: { startsWith: PREFIX } } }));
  await swallow(() => db.patient.deleteMany({ where: byUserEmail }));
  await swallow(() => db.user.deleteMany({ where: { email: { startsWith: PREFIX.toLowerCase() } } }));
}
