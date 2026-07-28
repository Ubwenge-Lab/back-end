// Seeds the minimum fixtures needed for stress-test.js to get HTTP 200 from
// all 4 target endpoints, in a disposable local database (the Docker
// primary from docker-compose.replication.yml). NOT for use against a real
// Supabase database — emails/password below are fixed test fixtures, not
// real accounts.
//
// Run (after `prisma migrate deploy` against the same DATABASE_URL):
//   DATABASE_URL=postgresql://evuze:evuze_local_pw@localhost:5433/evuze \
//   ENCRYPTION_KEY=loadtest0000000000000000000000ab \
//   npx ts-node --transpile-only load-testing/seed-fixtures.ts
//
// Re-running is safe: every row is keyed by a fixed id/email and upserted.
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { createAuditEncryptionExtension } from '../src/prisma/prisma.extension';

const TEST_PASSWORD = 'LoadTest!2026';

// Fixed ids so re-running this script upserts instead of duplicating.
const IDS = {
  pharmacyOwnerUser: 'a0000000-0000-4000-8000-000000000001',
  pharmacy: 'a0000000-0000-4000-8000-000000000002',
  branch: 'a0000000-0000-4000-8000-000000000003',
  cashierUser: 'a0000000-0000-4000-8000-000000000004',
  staff: 'a0000000-0000-4000-8000-000000000005',
  hospitalAdminUser: 'a0000000-0000-4000-8000-000000000006',
  hospital: 'a0000000-0000-4000-8000-000000000007',
  doctorUser: 'a0000000-0000-4000-8000-000000000008',
  doctor: 'a0000000-0000-4000-8000-000000000009',
  patientUser: 'a0000000-0000-4000-8000-00000000000a',
  patient: 'a0000000-0000-4000-8000-00000000000b',
  order: 'a0000000-0000-4000-8000-00000000000c',
  payment: 'a0000000-0000-4000-8000-00000000000d',
  invoiceStandalone: 'a0000000-0000-4000-8000-00000000000e',
  invoiceStandaloneItem: 'a0000000-0000-4000-8000-00000000000f',
  admission: 'a0000000-0000-4000-8000-000000000010',
  invoiceForAdmission: 'a0000000-0000-4000-8000-000000000011',
  invoiceForAdmissionItem: 'a0000000-0000-4000-8000-000000000012',
  diagnosticOrder: 'a0000000-0000-4000-8000-000000000013',
};

async function main() {
  const base = new PrismaClient();
  // Same encryption/audit extension the running app uses, so Patient.phone
  // is encrypted the same way the app will later decrypt it on read.
  const prisma = base.$extends(createAuditEncryptionExtension()) as any;

  const passwordHash = await bcrypt.hash(TEST_PASSWORD, 10);

  // --- Pharmacy side: owner -> pharmacy -> branch -> cashier staff ---
  const pharmacyOwnerUser = await prisma.user.upsert({
    where: { id: IDS.pharmacyOwnerUser },
    update: {},
    create: {
      id: IDS.pharmacyOwnerUser,
      email: 'loadtest-pharmacy-owner@evuze.test',
      password: passwordHash,
      role: 'PHARMACY',
      isVerified: true,
      isActive: true,
    },
  });

  const pharmacy = await prisma.pharmacy.upsert({
    where: { id: IDS.pharmacy },
    update: {},
    create: {
      id: IDS.pharmacy,
      userId: pharmacyOwnerUser.id,
      name: 'Load Test Pharmacy',
      phone: '0700000001',
      address: 'Kigali, Rwanda',
      status: 'APPROVED',
    },
  });

  const branch = await prisma.branch.upsert({
    where: { id: IDS.branch },
    update: {},
    create: {
      id: IDS.branch,
      pharmacyId: pharmacy.id,
      name: 'Load Test Branch',
      address: 'Kigali, Rwanda',
      phone: '0700000002',
      branchStatus: 'APPROVED',
      status: 'APPROVED',
    },
  });

  const cashierUser = await prisma.user.upsert({
    where: { id: IDS.cashierUser },
    update: {},
    create: {
      id: IDS.cashierUser,
      email: 'loadtest-cashier@evuze.test',
      password: passwordHash,
      role: 'CASHIER',
      isVerified: true,
      isActive: true,
    },
  });

  await prisma.staff.upsert({
    where: { id: IDS.staff },
    update: {},
    create: {
      id: IDS.staff,
      userId: cashierUser.id,
      branchId: branch.id,
      firstName: 'Load',
      lastName: 'Tester',
      status: 'ACTIVE',
    },
  });

  // --- Hospital side: admin -> hospital, doctor, patient ---
  const hospitalAdminUser = await prisma.user.upsert({
    where: { id: IDS.hospitalAdminUser },
    update: {},
    create: {
      id: IDS.hospitalAdminUser,
      email: 'loadtest-hospital-admin@evuze.test',
      password: passwordHash,
      role: 'HOSPITAL_ADMIN',
      isVerified: true,
      isActive: true,
    },
  });

  const hospital = await prisma.hospital.upsert({
    where: { id: IDS.hospital },
    update: {},
    create: {
      id: IDS.hospital,
      userId: hospitalAdminUser.id,
      name: 'Load Test Hospital',
      address: 'Kigali, Rwanda',
      phone: '0700000003',
      status: 'APPROVED',
    },
  });

  const doctorUser = await prisma.user.upsert({
    where: { id: IDS.doctorUser },
    update: {},
    create: {
      id: IDS.doctorUser,
      email: 'loadtest-doctor@evuze.test',
      password: passwordHash,
      role: 'DOCTOR',
      isVerified: true,
      isActive: true,
    },
  });

  const doctor = await prisma.doctor.upsert({
    where: { id: IDS.doctor },
    update: {},
    create: {
      id: IDS.doctor,
      userId: doctorUser.id,
      hospitalId: hospital.id,
      specialization: 'General Medicine',
      licenseNumber: 'LOADTEST-LIC-0001',
    },
  });

  const patientUser = await prisma.user.upsert({
    where: { id: IDS.patientUser },
    update: {},
    create: {
      id: IDS.patientUser,
      email: 'loadtest-patient@evuze.test',
      password: passwordHash,
      role: 'PATIENT',
      isVerified: true,
      isActive: true,
    },
  });

  const patient = await prisma.patient.upsert({
    where: { id: IDS.patient },
    update: {},
    create: {
      id: IDS.patient,
      userId: patientUser.id,
      firstName: 'Load',
      lastName: 'Testpatient',
      phone: '0700000004',
    },
  });

  // --- Payments: order + payment scoped to the cashier's branch ---
  const order = await prisma.order.upsert({
    where: { id: IDS.order },
    update: {},
    create: {
      id: IDS.order,
      patientId: patient.id,
      pharmacyId: pharmacy.id,
      branchId: branch.id,
      type: 'PICKUP',
      total: 5000,
      status: 'COMPLETED',
    },
  });

  const payment = await prisma.payment.upsert({
    where: { id: IDS.payment },
    update: {},
    create: {
      id: IDS.payment,
      orderId: order.id,
      amount: 5000,
      paymentMethod: 'CASH',
      status: 'COMPLETED',
      receiptNumber: 'LOADTEST-RCPT-0001',
    },
  });

  // --- Invoices: standalone invoice for GET /api/invoices/:id ---
  const invoiceStandalone = await prisma.hospitalInvoice.upsert({
    where: { id: IDS.invoiceStandalone },
    update: {},
    create: {
      id: IDS.invoiceStandalone,
      patientId: patient.id,
      hospitalId: hospital.id,
      totalAmount: 20000,
    },
  });

  await prisma.hospitalInvoiceItem.upsert({
    where: { id: IDS.invoiceStandaloneItem },
    update: {},
    create: {
      id: IDS.invoiceStandaloneItem,
      invoiceId: invoiceStandalone.id,
      description: 'Consultation fee',
      quantity: 1,
      unitCost: 20000,
      subtotal: 20000,
    },
  });

  // --- Inpatient admission + its checkout invoice ---
  const admission = await prisma.inpatientAdmission.upsert({
    where: { id: IDS.admission },
    update: {},
    create: {
      id: IDS.admission,
      patientId: patient.id,
      hospitalId: hospital.id,
      admittedByUserId: hospitalAdminUser.id,
      admittedByName: 'Load Test Admin',
      admittedByRole: 'HOSPITAL_ADMIN',
      reason: 'Load test fixture admission',
    },
  });

  const invoiceForAdmission = await prisma.hospitalInvoice.upsert({
    where: { id: IDS.invoiceForAdmission },
    update: {},
    create: {
      id: IDS.invoiceForAdmission,
      admissionId: admission.id,
      patientId: patient.id,
      hospitalId: hospital.id,
      totalAmount: 45000,
    },
  });

  await prisma.hospitalInvoiceItem.upsert({
    where: { id: IDS.invoiceForAdmissionItem },
    update: {},
    create: {
      id: IDS.invoiceForAdmissionItem,
      invoiceId: invoiceForAdmission.id,
      description: 'Daily bed charge',
      quantity: 1,
      unitCost: 45000,
      subtotal: 45000,
    },
  });

  // --- Diagnostic order, so /diagnostics/queue returns real rows ---
  await prisma.diagnosticOrder.upsert({
    where: { id: IDS.diagnosticOrder },
    update: {},
    create: {
      id: IDS.diagnosticOrder,
      patientId: patient.id,
      doctorId: doctor.id,
      testType: 'BLOOD',
      icd10Code: 'Z00.0',
      status: 'PENDING',
    },
  });

  console.log('\nFixtures ready. k6 env vars:\n');
  console.log(`QUEUE_USER_EMAIL=loadtest-hospital-admin@evuze.test`);
  console.log(`QUEUE_USER_PASSWORD=${TEST_PASSWORD}`);
  console.log(`INVOICE_USER_EMAIL=loadtest-hospital-admin@evuze.test`);
  console.log(`INVOICE_USER_PASSWORD=${TEST_PASSWORD}`);
  console.log(`ADMISSION_USER_EMAIL=loadtest-hospital-admin@evuze.test`);
  console.log(`ADMISSION_USER_PASSWORD=${TEST_PASSWORD}`);
  console.log(`PAYMENT_USER_EMAIL=loadtest-cashier@evuze.test`);
  console.log(`PAYMENT_USER_PASSWORD=${TEST_PASSWORD}`);
  console.log(`INVOICE_ID=${invoiceStandalone.id}`);
  console.log(`ADMISSION_ID=${admission.id}`);
  console.log(`PAYMENT_ID=${payment.id}`);

  await base.$disconnect();
}

main().catch((err) => {
  console.error('SEED FAILED:', err);
  process.exit(1);
});
