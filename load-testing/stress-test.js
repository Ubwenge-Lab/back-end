// High-throughput stress test for the diagnostics queue + billing read
// endpoints, used to (a) prove read traffic is offloaded to the DB replica
// and (b) prove the API stays up when the replica is killed mid-run.
//
// Run: see load-testing/README.md for full setup + required env vars.
import http from 'k6/http';
import { check } from 'k6';
import { login, authHeaders } from './lib/auth.js';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:4000';
const TOTAL_RPS = Number(__ENV.TARGET_RPS || 500);
const DURATION = __ENV.DURATION || '2m';

// Each scenario gets an equal share of TOTAL_RPS across the 4 endpoint
// groups from the ticket ("queue and billing endpoints").
const PER_SCENARIO_RPS = Math.max(1, Math.floor(TOTAL_RPS / 4));

export const options = {
  scenarios: {
    diagnostics_queue: scenario('queueVUs'),
    invoices_read: scenario('invoiceVUs'),
    admissions_checkout_invoice: scenario('admissionVUs'),
    payments_read: scenario('paymentVUs'),
  },
  thresholds: {
    // Acceptance criterion: API uptime >= 99.9% => error rate <= 0.1%.
    http_req_failed: ['rate<0.001'],
    http_req_duration: ['p(95)<1000'],
  },
};

function scenario(execName) {
  return {
    executor: 'ramping-arrival-rate',
    startRate: 0,
    timeUnit: '1s',
    preAllocatedVUs: Math.min(PER_SCENARIO_RPS * 2, 200),
    maxVUs: Math.min(PER_SCENARIO_RPS * 4, 500),
    stages: [
      { target: PER_SCENARIO_RPS, duration: '30s' }, // ramp up
      { target: PER_SCENARIO_RPS, duration: DURATION }, // sustain
      { target: 0, duration: '30s' }, // ramp down
    ],
    exec: execName,
  };
}

export function setup() {
  const queueToken = login(
    BASE_URL,
    __ENV.QUEUE_USER_EMAIL,
    __ENV.QUEUE_USER_PASSWORD,
    'diagnostics queue (TECHNICIAN/HOSPITAL_ADMIN/NURSE/SUPER_ADMIN)',
  );
  const invoiceToken = login(
    BASE_URL,
    __ENV.INVOICE_USER_EMAIL,
    __ENV.INVOICE_USER_PASSWORD,
    'invoices (PATIENT/HOSPITAL_ADMIN/RECEPTIONIST/SUPER_ADMIN)',
  );
  const admissionToken = login(
    BASE_URL,
    __ENV.ADMISSION_USER_EMAIL,
    __ENV.ADMISSION_USER_PASSWORD,
    'admissions checkout-invoice (DOCTOR/NURSE/HOSPITAL_ADMIN)',
  );
  const paymentToken = login(
    BASE_URL,
    __ENV.PAYMENT_USER_EMAIL,
    __ENV.PAYMENT_USER_PASSWORD,
    'payments (CASHIER/PHARMACIST/BRANCH_MANAGER)',
  );

  const invoiceId = requireEnv('INVOICE_ID');
  const admissionId = requireEnv('ADMISSION_ID');
  const paymentId = requireEnv('PAYMENT_ID');

  return {
    queueToken,
    invoiceToken,
    admissionToken,
    paymentToken,
    invoiceId,
    admissionId,
    paymentId,
  };
}

function requireEnv(name) {
  const value = __ENV[name];
  if (!value) {
    throw new Error(
      `Missing required env var ${name} — set it to a real seeded record id (see README.md).`,
    );
  }
  return value;
}

export function queueVUs(data) {
  const res = http.get(
    `${BASE_URL}/api/diagnostics/queue`,
    authHeaders(data.queueToken),
  );
  check(res, { 'queue: status 200': (r) => r.status === 200 });
}

export function invoiceVUs(data) {
  const res = http.get(
    `${BASE_URL}/api/invoices/${data.invoiceId}`,
    authHeaders(data.invoiceToken),
  );
  check(res, { 'invoice: status 200': (r) => r.status === 200 });
}

export function admissionVUs(data) {
  const res = http.get(
    `${BASE_URL}/api/inpatient/admissions/${data.admissionId}/checkout-invoice`,
    authHeaders(data.admissionToken),
  );
  check(res, { 'admission checkout-invoice: status 200': (r) => r.status === 200 });
}

export function paymentVUs(data) {
  const res = http.get(
    `${BASE_URL}/api/payments/${data.paymentId}/receipt`,
    authHeaders(data.paymentToken),
  );
  check(res, { 'payment receipt: status 200': (r) => r.status === 200 });
}
