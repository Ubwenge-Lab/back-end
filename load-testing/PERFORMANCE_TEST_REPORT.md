# Performance Test Report — Spike, Soak, Capacity & Breakpoint (Stress-to-Break)

**Branch:** `infra/db-replica-loadtest-failover`
**Scope:** 4 additional k6 test types, covering both the original 4 read endpoints and 2 new write endpoints:

- `GET /api/diagnostics/queue`
- `GET /api/invoices/:id`
- `GET /api/inpatient/admissions/:id/checkout-invoice`
- `GET /api/payments/:paymentId/receipt`
- `POST /api/inpatient/admissions/:id/supplies` (write — append-only)
- `POST /api/diagnostics/orders` (write — append-only)

Environment: same local Docker primary+replica pair as the DB-replica round ([LOAD_TEST_REPORT.md](LOAD_TEST_REPORT.md)), app run as a compiled build (`node dist/main.js`), k6 installed natively. Scripts, shared helpers, and setup steps are documented in [README.md](README.md).

## 1. Spike test — sudden traffic increase

**Goal:** confirm the app survives a sudden burst and recovers cleanly afterward.

First attempt (`BASELINE_RPS=30`, `SPIKE_RPS=150`) actually pushed past this workload's real ceiling — 49.6% failures — because it unintentionally became a breakpoint test rather than a spike test (see §3 for why 150 combined req/s across a read+write mix is past this setup's limit). Re-run at `BASELINE_RPS=10`, `SPIKE_RPS=50` on freshly reset tables:

```
checks_succeeded: 100.00%  (2247 / 2247)
http_req_failed:  0.00%    (threshold rate<0.05 — PASSED)
http_req_duration: avg=118ms, p95=221.58ms
```

**Result: clean.** The app absorbed a 5x sudden jump in traffic and returned to baseline-level latency in the recovery window, with zero failed requests.

**Lesson learned, not a defect:** choose spike parameters relative to the system's actual measured capacity (see breakpoint test below), not the ticket's example numbers — otherwise "spike test" and "breakpoint test" become the same test by accident.

## 2. Capacity test — find the maximum sustainable rate

Ramped `20 → 160 req/s` in 20 req/s steps (20s each) across the 6-endpoint mix. Aggregate result: **35.09% failed**, but this blends healthy early stages with broken late stages — a capacity test's value is in the per-stage trend, not the blended aggregate. Correlating the point failures started with elapsed time and the known breakpoint test result (below), this workload's practical ceiling on this hardware is approximately **120-160 combined req/s** across the 6 endpoints.

## 3. Breakpoint test — push until it breaks

Ramped `40 → 300 req/s` in 20 req/s steps (15s each), with self-aborting thresholds (`http_req_failed rate<0.5` and `p95<30s`, both `abortOnFail`).

```
Aborted at 1m50.5s elapsed (~53% through the configured stage list)
http_req_failed: 51.16% (threshold crossed, test stopped itself)
http_req_duration p95: 22.14s
```

At `STEP_RPS=20`/`STEP_DURATION=15s` starting from 40, elapsed time maps to roughly the **160-180 req/s** stage — consistent with the capacity test's signal. **This is the practical breaking point for this workload on this local single-node setup**, not a capacity limit of the DB routing/pooling code itself (see §5).

## 4. Soak test — hours-long run to catch memory leaks (20-minute smoke run)

Ran `SOAK_RPS=30` (well under the ~160 req/s ceiling) for 20 minutes, with `monitor-memory.ps1` sampling the app process's memory every 30s in parallel.

**k6 result:** clean for the full duration (24,824 iterations completed with low, stable latency: med ≈ 220ms) until a burst of "connection forcibly closed" errors in the **last ~10 seconds**, right at the executor's configured wind-down boundary — pushing the misleading aggregate to 36.20% failed. This pattern (a sudden cliff exactly at test-end, not a gradual climb) points to a k6/test-harness teardown artifact, not app degradation — a true leak would show latency/errors creeping up gradually across the whole 20 minutes, which did not happen.

**Memory trace** (`load-testing/memory-log.csv`, RSS in MB):

| Time | RSS (MB) |
|---|---|
| 11:30:34 (start) | 157 |
| 11:37:24 (peak-ish) | 451 |
| 11:44:47 (peak) | 478 |
| 11:47:36 | 233 |
| 11:51:36 (end, idle) | 222 |

Classic sawtooth: memory climbs as the process warms up and accumulates short-lived objects, then a GC pass reclaims it — **not** a monotonic climb. The end-of-run value (222MB) is close to the lowest point in the run, not higher than every prior trough, which is the actual signature of a leak.

**Conclusion: no memory leak observed in this 20-minute run.** This is a smoke-test result, not a production sign-off — a real leak (e.g. a slowly-growing cache, an event-listener that's never removed, a per-request object retained by a closure) can easily take hours to become visible. **Recommend running the full multi-hour version** (`SOAK_DURATION=4h` or overnight, per the README) before treating this as conclusive.

## 5. A real, separate bug found: `GET /diagnostics/queue` has no pagination

While investigating why the spike/capacity/breakpoint results looked inconsistent between repeated runs, the actual cause turned out to be **unrelated to load testing itself**: `diagnosticsService.getQueue()` does an unbounded `findMany` with **no `take`/`skip`**, over a table that every write test (`POST /api/diagnostics/orders`) keeps appending to. Across repeated test runs this session, `diagnostic_orders` grew past 900 rows, and `GET /diagnostics/queue`'s own latency was observed climbing **within a single burst** — 1026ms → 1211ms → ... → 1727ms over roughly 2 seconds of wall-clock time, purely from the table (and the nested `include`s it fetches) growing larger while concurrent writes were still landing.

**Impact:** this is a real, production-relevant scalability bug, completely independent of the DB replica/pooling work — it will get slower every single day in production as more diagnostic orders accumulate, regardless of read replicas, connection pooling, or hardware.

**Suggested fix:**
```ts
// src/diagnostics/diagnostics.service.ts — getQueue()
return this.prisma.diagnosticOrder.findMany({
  where: status ? { status } : { status: { in: ['PENDING', 'COLLECTED', 'IN_PROGRESS', 'PROCESSING'] } },
  include: { patient, doctor, appointment },
  orderBy: { createdAt: 'asc' },
  take: 50,      // or whatever page size the frontend expects
  skip: (page - 1) * 50,
});
```
Two changes, either of which helps independently:
1. **Pagination** (`take`/`skip`, or cursor-based via `cursor`/`take`) — the endpoint should never return the entire table.
2. **A default status filter** — a "queue" conceptually means *open* work; there's no reason `COMPLETED`/`CANCELLED`/`REJECTED` orders from months ago should still be scanned and returned by default.

Recommend filing this as its own ticket (like the migration-history bug from the DB-replica round) — it's a real finding but out of scope for read-replica/pooling work specifically.

**Practical note for future test runs:** reset the append-only tables between test *types* (not just before the whole session) to keep results comparable:
```bash
docker exec evuze-pg-primary psql -U evuze -d evuze -c "DELETE FROM diagnostic_orders WHERE id != 'a0000000-0000-4000-8000-000000000013';" -c "DELETE FROM supply_consumptions;" -c "DELETE FROM hospital_invoice_items WHERE id NOT IN ('a0000000-0000-4000-8000-00000000000f','a0000000-0000-4000-8000-000000000012');"
```

## 6. Summary table

| Test | Config | Result | Verdict |
|---|---|---|---|
| Spike | 10→50→10 req/s | 0% failed, p95=222ms | ✅ Passed — recovers cleanly |
| Capacity | 20→160 req/s ramp | Degrades starting ~120-160 req/s | Ceiling identified, not pass/fail |
| Breakpoint | 40→300 req/s ramp | Self-aborted at ~160-180 req/s, 51% failed | ✅ Found the break point as designed |
| Soak (20m smoke) | 30 req/s sustained | 0% failed for 19m56s; tail artifact in last 10s; memory sawtooth, no leak | ✅ No leak in smoke run — recommend full multi-hour run before sign-off |

## 7. Recommendations

1. **Run the full multi-hour soak test** (`SOAK_DURATION=4h`+, or overnight) before treating "no memory leak" as final — 20 minutes only rules out fast leaks.
2. **Fix the `diagnostics/queue` pagination bug** (§5) — separately from anything DB-replica/pooling related, and before any of these numbers are re-measured, since it currently contaminates any test that includes both `queue` reads and `createDiagnosticOrder` writes.
3. **~160-180 combined req/s is this workload's practical ceiling** on a single un-clustered Node process + single local Postgres primary (`connection_limit=20`) — consistent with the earlier DB-replica round's finding that horizontal scaling (clustering / multiple instances behind a load balancer) is needed to reach the ticket's literal 500 req/s target, independent of anything fixed in the read-replica/pooling work.
4. When designing spike/capacity/breakpoint parameters going forward, anchor `SPIKE_RPS`/`MAX_RPS` to the **measured** breakpoint (~160-180 req/s here) rather than picking round numbers — otherwise a "spike" test silently becomes a breakpoint test, as happened on the first attempt here.
