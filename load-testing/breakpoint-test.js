// Breakpoint / stress-to-failure test: keep climbing the request rate well
// past any reasonable ceiling until the system actually breaks (error rate
// or latency blows out), then stop automatically rather than grinding on a
// broken server for the rest of the configured duration.
//
// Run: see load-testing/README.md for full setup + required env vars.
import { sharedSetup, ENDPOINT_FNS } from './lib/scenarios.js';
import { rampingScenarios } from './lib/buildScenarios.js';

const START_RPS = Number(__ENV.START_RPS || 50);
const STEP_RPS = Number(__ENV.STEP_RPS || 50);
const STEP_DURATION = __ENV.STEP_DURATION || '20s';
const MAX_RPS = Number(__ENV.MAX_RPS || 1000);
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
    preAllocatedVUs: PER_ENDPOINT(MAX_RPS),
    maxVUs: PER_ENDPOINT(MAX_RPS) * 8,
  }),
  thresholds: {
    // abortOnFail stops the whole run early once the system has clearly
    // broken, instead of burning through every remaining stage.
    http_req_failed: [{ threshold: 'rate<0.5', abortOnFail: true, delayAbortEval: '10s' }],
    http_req_duration: [{ threshold: 'p(95)<30000', abortOnFail: true, delayAbortEval: '10s' }],
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
