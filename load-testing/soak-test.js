// Soak test: sustained moderate load for a long duration, to surface memory
// leaks / gradual degradation that only show up over hours, not seconds.
// Run monitor-memory.ps1 alongside this to sample the app process's memory
// over the same window (see load-testing/README.md).
//
// Default SOAK_DURATION is short (20m) for a smoke run. For a real overnight
// soak, override e.g. SOAK_DURATION=4h.
import { sharedSetup, ENDPOINT_FNS } from './lib/scenarios.js';
import { constantScenarios } from './lib/buildScenarios.js';

const SOAK_RPS = Number(__ENV.SOAK_RPS || 30);
const SOAK_DURATION = __ENV.SOAK_DURATION || '20m';
const PER_ENDPOINT = (n) => Math.max(1, Math.floor(n / 6));

export const options = {
  scenarios: constantScenarios(PER_ENDPOINT(SOAK_RPS), SOAK_DURATION, {
    preAllocatedVUs: PER_ENDPOINT(SOAK_RPS) * 2,
    maxVUs: PER_ENDPOINT(SOAK_RPS) * 4,
  }),
  thresholds: {
    // A soak test should stay clean the whole way through — any failure
    // rate above baseline noise indicates a leak-induced degradation.
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<1500'],
  },
};

export function setup() {
  return sharedSetup();
}

export const queueVUs = ENDPOINT_FNS.queue;
export const invoiceVUs = ENDPOINT_FNS.invoice;
export const admissionVUs = ENDPOINT_FNS.admissionCheckout;
export const paymentVUs = ENDPOINT_FNS.paymentReceipt;
export const supplyVUs = ENDPOINT_FNS.logSupply;
export const diagnosticOrderVUs = ENDPOINT_FNS.createDiagnosticOrder;
