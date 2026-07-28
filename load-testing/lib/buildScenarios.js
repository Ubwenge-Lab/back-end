// Generates one k6 scenario per endpoint (4 reads + 2 writes from
// scenarios.js), all sharing the same executor shape. Callers pass an
// already-divided per-endpoint rate/stage plan (i.e. divide your target
// total rate by 6 before calling these).
const EXEC_NAMES = {
  queue: 'queueVUs',
  invoice: 'invoiceVUs',
  admissionCheckout: 'admissionVUs',
  paymentReceipt: 'paymentVUs',
  logSupply: 'supplyVUs',
  createDiagnosticOrder: 'diagnosticOrderVUs',
};

export function rampingScenarios(stages, { preAllocatedVUs = 50, maxVUs = 300 } = {}) {
  const scenarios = {};
  for (const [key, execName] of Object.entries(EXEC_NAMES)) {
    scenarios[key] = {
      executor: 'ramping-arrival-rate',
      startRate: 0,
      timeUnit: '1s',
      preAllocatedVUs,
      maxVUs,
      stages,
      exec: execName,
    };
  }
  return scenarios;
}

export function constantScenarios(rate, duration, { preAllocatedVUs = 20, maxVUs = 100, timeUnit = '1s' } = {}) {
  const scenarios = {};
  for (const [key, execName] of Object.entries(EXEC_NAMES)) {
    scenarios[key] = {
      executor: 'constant-arrival-rate',
      rate,
      timeUnit,
      duration,
      preAllocatedVUs,
      maxVUs,
      exec: execName,
    };
  }
  return scenarios;
}
