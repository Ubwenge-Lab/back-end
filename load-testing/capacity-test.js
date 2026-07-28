// Capacity test: steadily climb the request rate in steps, holding briefly
// at each level, to find the highest rate the system sustains before error
// rate/latency degrade. This does NOT try to push past that point (see
// breakpoint-test.js for that) — read the per-stage numbers in the k6
// summary/time-series to find where things start to turn.
//
// Run: see load-testing/README.md for full setup + required env vars.
import { sharedSetup, ENDPOINT_FNS } from './lib/scenarios.js';
import { rampingScenarios } from './lib/buildScenarios.js';

const START_RPS = Number(__ENV.START_RPS || 20);
const STEP_RPS = Number(__ENV.STEP_RPS || 20);
const STEP_DURATION = __ENV.STEP_DURATION || '30s';
const MAX_RPS = Number(__ENV.MAX_RPS || 200);
const PER_ENDPOINT = (n) => Math.max(1, Math.floor(n / 6));

function buildStages() {
  const stages = [];
  for (let rps = START_RPS; rps <= MAX_RPS; rps += STEP_RPS) {
    stages.push({ target: PER_ENDPOINT(rps), duration: STEP_DURATION });
  }
  return stages;
}

export const options = {
  scenarios: rampingScenarios(buildStages(), {
    preAllocatedVUs: PER_ENDPOINT(MAX_RPS) * 2,
    maxVUs: PER_ENDPOINT(MAX_RPS) * 6,
  }),
  thresholds: {
    // Intentionally has no aggregate pass/fail threshold — the point of this
    // test is to find where the failure starts, not to pass/fail as a whole.
    // Read the per-stage http_req_failed / http_req_duration trend instead.
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
