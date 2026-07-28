// Shared endpoint request functions + fixture ids, reused across
// spike/capacity/breakpoint/soak test scripts. Fixture ids match
// load-testing/seed-fixtures.ts — reseed before running any of these
// if the local Docker DB was wiped.
import http from 'k6/http';
import { check } from 'k6';
import { login, authHeaders } from './auth.js';

export const BASE_URL = __ENV.BASE_URL || 'http://localhost:4000';

const FIXTURE_IDS = {
  invoiceId: 'a0000000-0000-4000-8000-00000000000e',
  admissionId: 'a0000000-0000-4000-8000-000000000010',
  paymentId: 'a0000000-0000-4000-8000-00000000000d',
  patientId: 'a0000000-0000-4000-8000-00000000000b',
};

// Logs in once per required role (call only from setup(), never per-iteration —
// /api/auth/* is throttled to 5 req/min per client).
export function sharedSetup() {
  const hospitalAdminToken = login(
    BASE_URL,
    __ENV.HOSPITAL_ADMIN_EMAIL || 'loadtest-hospital-admin@evuze.test',
    __ENV.HOSPITAL_ADMIN_PASSWORD || 'LoadTest!2026',
    'hospital admin (queue/invoice/admission/supply-log)',
  );
  const cashierToken = login(
    BASE_URL,
    __ENV.CASHIER_EMAIL || 'loadtest-cashier@evuze.test',
    __ENV.CASHIER_PASSWORD || 'LoadTest!2026',
    'cashier (payment receipt)',
  );
  const doctorToken = login(
    BASE_URL,
    __ENV.DOCTOR_EMAIL || 'loadtest-doctor@evuze.test',
    __ENV.DOCTOR_PASSWORD || 'LoadTest!2026',
    'doctor (create diagnostic order)',
  );

  return {
    hospitalAdminToken,
    cashierToken,
    doctorToken,
    ...FIXTURE_IDS,
  };
}

// --- Read endpoints ---

export function hitQueue(data) {
  const res = http.get(`${BASE_URL}/api/diagnostics/queue`, authHeaders(data.hospitalAdminToken));
  check(res, { 'queue: 200': (r) => r.status === 200 });
}

export function hitInvoice(data) {
  const res = http.get(`${BASE_URL}/api/invoices/${data.invoiceId}`, authHeaders(data.hospitalAdminToken));
  check(res, { 'invoice: 200': (r) => r.status === 200 });
}

export function hitAdmissionCheckout(data) {
  const res = http.get(
    `${BASE_URL}/api/inpatient/admissions/${data.admissionId}/checkout-invoice`,
    authHeaders(data.hospitalAdminToken),
  );
  check(res, { 'admission checkout-invoice: 200': (r) => r.status === 200 });
}

export function hitPaymentReceipt(data) {
  const res = http.get(`${BASE_URL}/api/payments/${data.paymentId}/receipt`, authHeaders(data.cashierToken));
  check(res, { 'payment receipt: 200': (r) => r.status === 200 });
}

// --- Write endpoints ---
// Both are append-only (no "already done" guard), so they're safe to hammer
// repeatedly without running out of valid state mid-test.

export function hitLogSupply(data) {
  const res = http.post(
    `${BASE_URL}/api/inpatient/admissions/${data.admissionId}/supplies`,
    JSON.stringify({
      itemName: 'Syringe 10mL',
      category: 'CONSUMABLE',
      quantity: 1,
      unitCost: 0.5,
    }),
    { headers: { 'Content-Type': 'application/json', ...authHeaders(data.hospitalAdminToken).headers } },
  );
  check(res, { 'log supply: 201': (r) => r.status === 201 || r.status === 200 });
}

export function hitCreateDiagnosticOrder(data) {
  const res = http.post(
    `${BASE_URL}/api/diagnostics/orders`,
    JSON.stringify({
      patientId: data.patientId,
      testType: 'BLOOD',
      icd10Code: 'Z00.0',
    }),
    { headers: { 'Content-Type': 'application/json', ...authHeaders(data.doctorToken).headers } },
  );
  check(res, { 'create diagnostic order: 201': (r) => r.status === 201 || r.status === 200 });
}

export const ENDPOINT_FNS = {
  queue: hitQueue,
  invoice: hitInvoice,
  admissionCheckout: hitAdmissionCheckout,
  paymentReceipt: hitPaymentReceipt,
  logSupply: hitLogSupply,
  createDiagnosticOrder: hitCreateDiagnosticOrder,
};

export const ENDPOINT_NAMES = Object.keys(ENDPOINT_FNS);
