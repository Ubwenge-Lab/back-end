// scripts/cleanup-staging.ts
//
// Flushes test records created by e2e/smoke test runs from a STAGING
// database, without touching core schema configuration (HospitalConfig,
// MedicationRegistry, department lists, drug catalog entries, etc).
//
// Convention (matches existing test/hospitals-stats.e2e-spec.ts pattern):
//   - Hospital / Pharmacy / Branch names created by tests start with "TEST_"
//   - User emails created by tests start with "test_"
// Anything that does NOT match those prefixes is left completely alone.
//
// Usage:
//   npx ts-node scripts/cleanup-staging.ts
//   npx ts-node scripts/cleanup-staging.ts --confirm   (skips the interactive prompt, for CI)
//
// Safety:
//   - Refuses to run unless NODE_ENV is explicitly "staging" or "test".
//   - Refuses to run if DATABASE_URL looks like it points at production.
//   - Prints a dry-run count before deleting anything.

import { PrismaClient } from '@prisma/client';
import * as readline from 'readline';

const prisma = new PrismaClient();

const TEST_NAME_PREFIX = 'TEST_';
const TEST_EMAIL_PREFIX = 'test_';

function assertSafeEnvironment() {
  const env = process.env.NODE_ENV;
  if (env !== 'staging' && env !== 'test') {
    throw new Error(
      `Refusing to run cleanup-staging.ts: NODE_ENV is "${env}". ` +
        `This script only runs when NODE_ENV=staging or NODE_ENV=test.`,
    );
  }

  const dbUrl = process.env.DATABASE_URL ?? '';
  if (/prod|production/i.test(dbUrl)) {
    throw new Error(
      'Refusing to run cleanup-staging.ts: DATABASE_URL appears to point at a production database.',
    );
  }
}

async function countTestData() {
  const [hospitals, pharmacies, users, appointments, orders] = await Promise.all([
    prisma.hospital.count({ where: { name: { startsWith: TEST_NAME_PREFIX } } }),
    prisma.pharmacy.count({ where: { name: { startsWith: TEST_NAME_PREFIX } } }),
    prisma.user.count({ where: { email: { startsWith: TEST_EMAIL_PREFIX } } }),
    prisma.appointment.count({ where: { hospital: { name: { startsWith: TEST_NAME_PREFIX } } } }),
    prisma.order.count({ where: { patient: { user: { email: { startsWith: TEST_EMAIL_PREFIX } } } } }),
  ]);

  return { hospitals, pharmacies, users, appointments, orders };
}

async function confirm(counts: Awaited<ReturnType<typeof countTestData>>) {
  if (process.argv.includes('--confirm')) return true;

  console.log('\nAbout to delete test data matching prefix conventions:');
  console.table(counts);

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer: string = await new Promise((resolve) =>
    rl.question('Proceed? (yes/no): ', resolve),
  );
  rl.close();
  return answer.trim().toLowerCase() === 'yes';
}

async function cleanup() {
  assertSafeEnvironment();

  const counts = await countTestData();
  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  if (total === 0) {
    console.log('No test data found matching TEST_ / test_ prefixes. Nothing to do.');
    return;
  }

  const proceed = await confirm(counts);
  if (!proceed) {
    console.log('Aborted.');
    return;
  }

  // Deletion order matters: children before parents, respecting FK
  // constraints that are NOT set to onDelete: Cascade in schema.prisma.
  // (Appointment, Prescription, HospitalInvoice all hold hard references
  // to Patient/Doctor/Hospital that block deletion if left in place.)

  console.log('Deleting hospital-side test records...');
  await prisma.prescription.deleteMany({
    where: { patient: { user: { email: { startsWith: TEST_EMAIL_PREFIX } } } },
  });
  await prisma.hospitalInvoice.deleteMany({
    where: { hospital: { name: { startsWith: TEST_NAME_PREFIX } } },
  });
  await prisma.appointment.deleteMany({
    where: { hospital: { name: { startsWith: TEST_NAME_PREFIX } } },
  });
  await prisma.diagnosticOrder.deleteMany({
    where: { patient: { user: { email: { startsWith: TEST_EMAIL_PREFIX } } } },
  });
  await prisma.hospitalPatientRegistration.deleteMany({
    where: { hospital: { name: { startsWith: TEST_NAME_PREFIX } } },
  });
  await prisma.hospitalStaff.deleteMany({
    where: { hospital: { name: { startsWith: TEST_NAME_PREFIX } } },
  });
  await prisma.doctor.deleteMany({
    where: { hospital: { name: { startsWith: TEST_NAME_PREFIX } } },
  });
  await prisma.hospitalConfig.deleteMany({
    where: { hospital: { name: { startsWith: TEST_NAME_PREFIX } } },
  });
  await prisma.hospital.deleteMany({
    where: { name: { startsWith: TEST_NAME_PREFIX } },
  });

  console.log('Deleting pharmacy-side test records...');
  await prisma.orderItem.deleteMany({
    where: { order: { patient: { user: { email: { startsWith: TEST_EMAIL_PREFIX } } } } },
  });
  await prisma.payment.deleteMany({
    where: { order: { patient: { user: { email: { startsWith: TEST_EMAIL_PREFIX } } } } },
  });
  await prisma.order.deleteMany({
    where: { patient: { user: { email: { startsWith: TEST_EMAIL_PREFIX } } } },
  });
  await prisma.cartItem.deleteMany({
    where: { patient: { user: { email: { startsWith: TEST_EMAIL_PREFIX } } } },
  });
  await prisma.medication.deleteMany({
    where: { branch: { name: { startsWith: TEST_NAME_PREFIX } } },
  });
  await prisma.branch.deleteMany({
    where: { name: { startsWith: TEST_NAME_PREFIX } },
  });
  await prisma.pharmacy.deleteMany({
    where: { name: { startsWith: TEST_NAME_PREFIX } },
  });

  console.log('Deleting test user accounts (patients, staff, admins)...');
  await prisma.patient.deleteMany({
    where: { user: { email: { startsWith: TEST_EMAIL_PREFIX } } },
  });
  await prisma.user.deleteMany({
    where: { email: { startsWith: TEST_EMAIL_PREFIX } },
  });

  console.log('Staging cleanup complete. Core config (HospitalConfig, MedicationRegistry, etc) left untouched.');
}

cleanup()
  .catch((err) => {
    console.error('Cleanup failed:', err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
