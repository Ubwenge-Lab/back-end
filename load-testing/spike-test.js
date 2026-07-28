// Spike test: sudden traffic increase, held briefly, then a sudden drop —
// verifies the app doesn't fall over on a burst and recovers cleanly after.
//
// Run: see load-testing/README.md for full setup + required env vars.
import { sharedSetup, ENDPOINT_FNS } from './lib/scenarios.js';
import { rampingScenarios } from './lib/buildScenarios.js';

const BASELINE_RPS = Number(__ENV.BASELINE_RPS || 20);
const SPIKE_RPS = Number(__ENV.SPIKE_RPS || 300);
const PER_ENDPOINT = (n) => Math.max(1, Math.floor(n / 6));

export const options = {
  scenarios: rampingScenarios(
    [
      { target: PER_ENDPOINT(BASELINE_RPS), duration: '30s' }, // steady baseline
      { target: PER_ENDPOINT(SPIKE_RPS), duration: '10s' },    // sudden spike up
      { target: PER_ENDPOINT(SPIKE_RPS), duration: '30s' },    // hold at spike
      { target: PER_ENDPOINT(BASELINE_RPS), duration: '10s' }, // sudden drop
      { target: PER_ENDPOINT(BASELINE_RPS), duration: '30s' }, // recovery window
    ],
    { preAllocatedVUs: PER_ENDPOINT(SPIKE_RPS) * 2, maxVUs: PER_ENDPOINT(SPIKE_RPS) * 6 },
  ),
  thresholds: {
    // Looser than the failover test's 99.9% — a brief spike is allowed to
    // degrade somewhat, it just shouldn't collapse (high error rate) or fail
    // to recover once the spike passes. Inspect the time-series (not just
    // this aggregate) to confirm errors were concentrated in the spike
    // window and recovery window looks like baseline again.
    http_req_failed: ['rate<0.05'],
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
