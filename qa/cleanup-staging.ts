/**
 * Staging Database Cleanup Utility
 *
 * Safely flushes test records from the staging database without dropping
 * any tables or touching the core schema.  Targets two kinds of records:
 *
 *   1. TEST_JOURNEY_ prefix — records created by the e2e smoke suite
 *   2. TEST_STATS_   prefix — records created by hospitals-stats.e2e-spec.ts
 *
 * Core schema objects (roles, enums, seed pharmacies/hospitals) are NEVER
 * deleted.  Only rows whose identifying string (email / name / MRN) starts
 * with one of the prefixes above are removed.
 *
 * Usage:
 *   ts-node qa/cleanup-staging.ts
 *
 * The script reads DATABASE_URL from the environment (same as the app).
 * On staging you can run it via Doppler:
 *   doppler run -- ts-node qa/cleanup-staging.ts
 */

import { PrismaClient } from '@prisma/client';

const TEST_PREFIXES = ['TEST_JOURNEY_', 'TEST_STATS_'];

const prisma = new PrismaClient({
  log: [{ level: 'warn', emit: 'stdout' }, { level: 'error', emit: 'stdout' }],
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Returns a Prisma `OR` filter that matches any of the test prefixes */
function emailFilter() {
  return {
    OR: TEST_PREFIXES.map((p) => ({
      email: { startsWith: p.toLowerCase() },
    })),
  };
}

function hospitalNameFilter() {
  return {
    OR: TEST_PREFIXES.map((p) => ({
      name: { startsWith: p },
    })),
  };
}

function mrnFilter() {
  return {
    OR: TEST_PREFIXES.map((p) => ({
      mrn: { startsWith: p },
    })),
  };
}

/** Log count of deleted rows, or skip silently when count is 0 */
function log(table: string, count: number) {
  if (count > 0) console.log(`  ✓  ${table.padEnd(38)} ${count} row(s) deleted`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n══════════════════════════════════════════════════════');
  console.log('  Staging Cleanup — hospital test data');
  console.log(`  Prefixes: ${TEST_PREFIXES.join(', ')}`);
  console.log('══════════════════════════════════════════════════════\n');

  const dryRun = process.argv.includes('--dry-run');
  if (dryRun) {
    console.log('  ⚠  DRY-RUN mode — no rows will be deleted\n');
  }

  /** Wraps a delete call so it becomes a count-only SELECT in dry-run mode */
  async function del<T extends { count: number }>(
    label: string,
    fn: () => Promise<T>,
    countFn: () => Promise<number>,
  ) {
    const count = dryRun ? await countFn() : (await fn()).count;
    if (count > 0 || dryRun) log(label + (dryRun ? ' [would delete]' : ''), count);
  }

  try {
    // ── 1. Prescription medications ───────────────────────────────────────────
    await del(
      'PrescriptionMedication',
      () =>
        prisma.prescriptionMedication.deleteMany({
          where: {
            prescription: {
              hospital: hospitalNameFilter(),
            },
          },
        }),
      () =>
        prisma.prescriptionMedication.count({
          where: {
            prescription: {
              hospital: hospitalNameFilter(),
            },
          },
        }),
    );

    // ── 2. Prescriptions (hospital-issued, linked by hospitalId) ──────────────
    await del(
      'Prescription (hospital-issued)',
      () =>
        prisma.prescription.deleteMany({
          where: { hospital: hospitalNameFilter() },
        }),
      () =>
        prisma.prescription.count({
          where: { hospital: hospitalNameFilter() },
        }),
    );

    // ── 3. Diagnostic orders ──────────────────────────────────────────────────
    await del(
      'DiagnosticOrder',
      () =>
        prisma.diagnosticOrder.deleteMany({
          where: {
            patient: {
              user: emailFilter(),
            },
          },
        }),
      () =>
        prisma.diagnosticOrder.count({
          where: {
            patient: {
              user: emailFilter(),
            },
          },
        }),
    );

    // ── 4. Hospital invoice items ─────────────────────────────────────────────
    await del(
      'HospitalInvoiceItem',
      () =>
        prisma.hospitalInvoiceItem.deleteMany({
          where: { invoice: { hospital: hospitalNameFilter() } },
        }),
      () =>
        prisma.hospitalInvoiceItem.count({
          where: { invoice: { hospital: hospitalNameFilter() } },
        }),
    );

    // ── 5. Hospital invoices ──────────────────────────────────────────────────
    await del(
      'HospitalInvoice',
      () =>
        prisma.hospitalInvoice.deleteMany({
          where: { hospital: hospitalNameFilter() },
        }),
      () =>
        prisma.hospitalInvoice.count({
          where: { hospital: hospitalNameFilter() },
        }),
    );

    // ── 6. Appointments (TriageVitals cascade via onDelete: Cascade) ──────────
    await del(
      'Appointment (+ TriageVitals via cascade)',
      () =>
        prisma.appointment.deleteMany({
          where: { hospital: hospitalNameFilter() },
        }),
      () =>
        prisma.appointment.count({
          where: { hospital: hospitalNameFilter() },
        }),
    );

    // ── 7. Hospital patient registrations ─────────────────────────────────────
    await del(
      'HospitalPatientRegistration',
      () =>
        prisma.hospitalPatientRegistration.deleteMany({
          where: {
            OR: [
              { hospital: hospitalNameFilter() },
              mrnFilter(),
            ],
          },
        }),
      () =>
        prisma.hospitalPatientRegistration.count({
          where: {
            OR: [
              { hospital: hospitalNameFilter() },
              mrnFilter(),
            ],
          },
        }),
    );

    // ── 8. Doctor schedules ───────────────────────────────────────────────────
    await del(
      'DoctorSchedule',
      () =>
        prisma.doctorSchedule.deleteMany({
          where: { doctor: { hospital: hospitalNameFilter() } },
        }),
      () =>
        prisma.doctorSchedule.count({
          where: { doctor: { hospital: hospitalNameFilter() } },
        }),
    );

    // ── 9. Doctors ────────────────────────────────────────────────────────────
    await del(
      'Doctor',
      () =>
        prisma.doctor.deleteMany({
          where: { hospital: hospitalNameFilter() },
        }),
      () =>
        prisma.doctor.count({
          where: { hospital: hospitalNameFilter() },
        }),
    );

    // ── 10. Hospital staff (nurses, receptionists, technicians) ───────────────
    await del(
      'HospitalStaff',
      () =>
        prisma.hospitalStaff.deleteMany({
          where: { hospital: hospitalNameFilter() },
        }),
      () =>
        prisma.hospitalStaff.count({
          where: { hospital: hospitalNameFilter() },
        }),
    );

    // ── 11. Hospitals ─────────────────────────────────────────────────────────
    await del(
      'Hospital',
      () => prisma.hospital.deleteMany({ where: hospitalNameFilter() }),
      () => prisma.hospital.count({ where: hospitalNameFilter() }),
    );

    // ── 12. Patients (cascade from user) ──────────────────────────────────────
    await del(
      'Patient',
      () =>
        prisma.patient.deleteMany({
          where: { user: emailFilter() },
        }),
      () =>
        prisma.patient.count({
          where: { user: emailFilter() },
        }),
    );

    // ── 13. Users ─────────────────────────────────────────────────────────────
    await del(
      'User',
      () => prisma.user.deleteMany({ where: emailFilter() }),
      () => prisma.user.count({ where: emailFilter() }),
    );

    console.log('\n══════════════════════════════════════════════════════');
    console.log(
      dryRun ? '  Dry-run complete — no data was modified.' : '  Cleanup complete.',
    );
    console.log('══════════════════════════════════════════════════════\n');
  } catch (err) {
    console.error('\n  ✗  Cleanup failed:', err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
