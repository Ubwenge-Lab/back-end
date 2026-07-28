# Load testing: read-replica offload + DB failover

Stress-tests `GET /api/diagnostics/queue` plus one read endpoint each from
`inpatient-billing`, `invoices`, and `payments`, and verifies:

1. Read queries are actually served by the DB replica (not the primary).
2. API uptime stays >= 99.9% (k6 threshold: `http_req_failed rate < 0.001`)
   even while the replica is killed mid-test.

Supabase's Read Replica feature requires a Pro+ plan, so this uses a local
Postgres primary + streaming-replica pair (`docker-compose.replication.yml`
at the repo root) as a free, real (not mocked) stand-in. The app code
(`src/prisma/read-replica.router.ts`) doesn't care where the replica lives —
point `DATABASE_REPLICA_URL` at a real Supabase replica later and nothing
else changes.

## 1. Prerequisites

- Docker (for the local primary/replica pair)
- [k6](https://k6.io/docs/get-started/installation/) installed and on your
  `PATH` — this is a standalone binary, not an npm package.
- Seeded test accounts covering these role groups (create them via your
  normal seed/registration flow — do NOT commit real credentials anywhere):
  | Env var pair | Required role (one of) |
  |---|---|
  | `QUEUE_USER_EMAIL` / `QUEUE_USER_PASSWORD` | TECHNICIAN, HOSPITAL_ADMIN, NURSE, SUPER_ADMIN |
  | `INVOICE_USER_EMAIL` / `INVOICE_USER_PASSWORD` | PATIENT, HOSPITAL_ADMIN, RECEPTIONIST, SUPER_ADMIN |
  | `ADMISSION_USER_EMAIL` / `ADMISSION_USER_PASSWORD` | DOCTOR, NURSE, HOSPITAL_ADMIN |
  | `PAYMENT_USER_EMAIL` / `PAYMENT_USER_PASSWORD` | CASHIER, PHARMACIST, BRANCH_MANAGER |
- Real record IDs that exist in the database you're testing against:
  `INVOICE_ID`, `ADMISSION_ID`, `PAYMENT_ID`.

## 2. Bring up the local primary + replica

```bash
docker compose -f docker-compose.replication.yml up -d
docker compose -f docker-compose.replication.yml ps   # wait for both healthy
```

Point Prisma at the local primary and run migrations against it (this is a
disposable local DB — safe to migrate/seed freely):

```bash
export DATABASE_URL="postgresql://evuze:evuze_local_pw@localhost:5433/evuze"
export DIRECT_URL="$DATABASE_URL"
npx prisma migrate deploy
npm run seed   # or however you normally seed test users/data
```

Confirm replication is actually live before trusting any test results:

```bash
docker exec evuze-pg-primary psql -U evuze -d evuze -c "SELECT * FROM pg_stat_replication;"
# expect one row, state = streaming
```

## 3. Run the app with replica routing enabled

In your `.env` (or exported env), set:

```
DATABASE_URL=postgresql://evuze:evuze_local_pw@localhost:5433/evuze
DIRECT_URL=postgresql://evuze:evuze_local_pw@localhost:5433/evuze
DATABASE_REPLICA_URL=postgresql://evuze:evuze_local_pw@localhost:5434/evuze
```

Then `npm run start:dev`. On boot you should see:
`[PrismaService] Read-replica routing enabled (DATABASE_REPLICA_URL set)`.

## 4. Run the stress test

```bash
cd load-testing
BASE_URL=http://localhost:4000 \
TARGET_RPS=500 \
QUEUE_USER_EMAIL=... QUEUE_USER_PASSWORD=... \
INVOICE_USER_EMAIL=... INVOICE_USER_PASSWORD=... \
ADMISSION_USER_EMAIL=... ADMISSION_USER_PASSWORD=... \
PAYMENT_USER_EMAIL=... PAYMENT_USER_PASSWORD=... \
INVOICE_ID=... ADMISSION_ID=... PAYMENT_ID=... \
k6 run stress-test.js
```

`TARGET_RPS` (default 500) is split evenly across the 4 endpoints. Lower it
for a first smoke run (e.g. `TARGET_RPS=20`) before attempting the full
500 req/s ticket target — that requires real hardware headroom on whatever
machine is running the app + local Postgres containers.

While it runs, confirm reads are hitting the replica, not the primary:

```bash
# on the replica — should climb during the test
docker exec evuze-pg-replica psql -U evuze -d evuze -c \
  "SELECT sum(xact_commit) FROM pg_stat_database WHERE datname='evuze';"
```

## 5. Simulate a replica failover mid-test

While `k6 run` is still going, in another terminal:

```bash
docker compose -f docker-compose.replication.yml stop pg-replica
```

Watch the app logs — you should see repeated
`[PrismaReadReplicaRouter] Replica read failed ... falling back to primary`
warnings, and the k6 output should keep reporting successful checks (reads
now served by primary). Bring the replica back to confirm recovery:

```bash
docker compose -f docker-compose.replication.yml start pg-replica
```

Note: `docker-entrypoint.sh` re-runs standby startup on restart using the
same data dir, so it resumes streaming from where it left off — no need to
re-clone unless you ran `down -v`.

## 6. Reading the results

k6's summary reports `http_req_failed` (fraction of requests that errored)
and the two configured thresholds. Since uptime = `1 - error_rate`:

- `http_req_failed` rate stayed under `0.001` (0.1%) for the whole run,
  **including the window where the replica was down** → satisfies the
  ">= 99.9% uptime during replica offline" acceptance criterion.
- If `http_req_failed` threshold fails, check the app logs first — a spike
  right when you stopped the replica with requests still erroring (rather
  than falling back) points to a bug in the fallback logic in
  `src/prisma/read-replica.router.ts`, not an infra problem.

## 7. Other performance test types

`spike-test.js`, `capacity-test.js`, `breakpoint-test.js`, and `soak-test.js`
cover 4 more standard load-test shapes, all against the same 4 read endpoints
**plus** two write endpoints (`POST /api/inpatient/admissions/:id/supplies`
and `POST /api/diagnostics/orders` — both append-only, safe to hammer
repeatedly). They share `load-testing/lib/scenarios.js` and
`load-testing/lib/buildScenarios.js` rather than duplicating the
login/request logic 4 times.

These default to reading credentials from the fixed test accounts created by
`seed-fixtures.ts` (`loadtest-hospital-admin@evuze.test`,
`loadtest-cashier@evuze.test`, `loadtest-doctor@evuze.test`, password
`LoadTest!2026`) — override via `HOSPITAL_ADMIN_EMAIL`/`_PASSWORD`,
`CASHIER_EMAIL`/`_PASSWORD`, `DOCTOR_EMAIL`/`_PASSWORD` if you seeded
different accounts. Fixture record ids are hardcoded to match
`seed-fixtures.ts`'s output.

### Spike test — sudden traffic increase

Steady baseline → sudden jump to a high rate → hold briefly → sudden drop →
recovery window. Checks the app doesn't collapse on a burst and returns to
normal once it passes.

```bash
cd load-testing
BASELINE_RPS=20 SPIKE_RPS=300 k6 run spike-test.js
```

Threshold is loose (`http_req_failed rate<0.05`) since some degradation
during the spike itself is expected — what matters is that the **recovery
window** (the last stage) looks like the baseline again. Inspect the
time-series, not just the aggregate summary, to see whether errors were
confined to the spike window.

### Capacity test — find the maximum sustainable rate

Climbs in steps (`START_RPS` → `MAX_RPS` by `STEP_RPS`, holding `STEP_DURATION`
at each level) and stops at a reasonable ceiling. No aggregate threshold —
the point is to find where things start to degrade, not pass/fail as a whole.

```bash
cd load-testing
START_RPS=20 STEP_RPS=20 STEP_DURATION=30s MAX_RPS=200 k6 run capacity-test.js
```

Read the per-stage numbers (k6 prints running throughput/VUs continuously)
to find the last step where `http_req_failed` stayed near 0 and latency
stayed reasonable — that's this system's practical capacity on the hardware
under test.

### Breakpoint test — push until it breaks

Same shape as the capacity test but keeps climbing well past any sane
ceiling (`MAX_RPS` defaults to 1000), and self-aborts once it clearly breaks
(`http_req_failed` rate ≥ 50%, or p95 latency ≥ 30s) instead of grinding
through the rest of the configured stages against a broken server.

```bash
cd load-testing
START_RPS=50 STEP_RPS=50 STEP_DURATION=20s MAX_RPS=1000 k6 run breakpoint-test.js
```

The stage where it aborts, and what the app logs show at that moment (OOM?
connection pool exhaustion? OS refusing new connections?), is the actual
finding — capture both.

### Soak test — hours-long run to catch memory leaks

Constant moderate rate (`SOAK_RPS`, well under this system's known capacity)
sustained for `SOAK_DURATION` (default `20m` for a smoke run; use something
like `4h` or overnight for a real soak). Run `monitor-memory.ps1` in a
**separate terminal** at the same time to sample the app process's memory
throughout:

```bash
# terminal 1
cd load-testing
SOAK_RPS=30 SOAK_DURATION=4h k6 run soak-test.js

# terminal 2 (PowerShell)
.\load-testing\monitor-memory.ps1 -Port 4000 -IntervalSeconds 30 -OutFile load-testing\memory-log.csv
```

A leak shows up as `rss_mb`/`private_mb` in `memory-log.csv` trending upward
over the run and never coming back down, even though request rate is flat —
plot the CSV or eyeball it for a monotonic climb. Occasional sawtooth
(rises then drops from GC) is normal and not a leak.

## Cleanup

```bash
docker compose -f docker-compose.replication.yml down -v
```

This deletes the local primary/replica data volumes — they're disposable
test data, not your Supabase database.
