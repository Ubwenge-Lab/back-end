# Load Test Report — DB Read/Write Split, Connection Pooling & Failover

**Branch:** `infra/db-replica-loadtest-failover`
**Scope:** Prisma read-replica routing, connection pool tuning, and k6-driven crash-failover testing against `GET /api/diagnostics/queue`, `GET /api/invoices/:id`, `GET /api/inpatient/admissions/:id/checkout-invoice`, and `GET /api/payments/:paymentId/receipt`.

## 1. Why a local Docker replica, not Supabase

Supabase's managed Read Replica feature requires the Pro plan; this project is on Free. Rather than mock the behavior, this test used a real Postgres primary + streaming-replica pair (`docker-compose.replication.yml`), which uses the same WAL-streaming replication mechanism a managed replica uses under the hood. The application code (`src/prisma/read-replica.router.ts`) only cares about a connection string in `DATABASE_REPLICA_URL` — it is unaware of whether that string points at this local Docker replica or a future real Supabase Pro replica.

## 2. What was implemented

| Component | File |
|---|---|
| Read/write routing (Proxy-based, model-delegate level) | [src/prisma/read-replica.router.ts](../src/prisma/read-replica.router.ts) |
| Primary/replica client wiring, fallback-on-failure | [src/prisma/prisma.service.ts](../src/prisma/prisma.service.ts) |
| Audit-log writes pinned to primary regardless of which client ran the read | [src/prisma/prisma.extension.ts](../src/prisma/prisma.extension.ts) |
| Local primary + streaming replica (test-only) | [docker-compose.replication.yml](../docker-compose.replication.yml), [docker/](../docker/) |
| Fixture seeding for the 4 target endpoints | [load-testing/seed-fixtures.ts](seed-fixtures.ts) |
| k6 stress + failover script | [load-testing/stress-test.js](stress-test.js) |

Read operations routed to replica: `findUnique`, `findUniqueOrThrow`, `findFirst`, `findFirstOrThrow`, `findMany`, `count`, `aggregate`, `groupBy`. Everything else (writes, `$transaction`, raw queries) goes straight to primary. On any replica error, the call retries on primary automatically and logs a warning — no persistent circuit-breaker state, so recovery is automatic the instant the replica comes back.

## 3. Test methodology

1. Brought up the local primary+replica pair, confirmed real streaming replication (`pg_stat_replication` showed `state=streaming`, `pg_is_in_recovery()=true` on the replica).
2. Ran a live integration check of the actual router code against the two containers: write→primary, read→replica while up, read→primary-fallback while replica disconnected, read→replica again after reconnect. All passed.
3. Seeded deterministic fixtures (no real/PII data — fixed test emails, fake UUIDs) covering all 4 endpoints' full FK chains.
4. Ran the compiled app (`node dist/main.js`, not `nest start --watch` — see [§5.5](#55-nest-startwatch-recompile-loop-environment-only)) against the local primary+replica.
5. Ran k6 (installed natively via `winget`, not the Docker image — see [§5.4](#54-dockerized-k6-hit-an-unrelated-windows-nat-bottleneck)) at two load levels, stopping and restarting the `pg-replica` container mid-run each time to simulate a crash.

## 4. Results

### 4.1 Correctness (acceptance criteria)

At a sustainable 150 req/s (592 max VUs), with `pg-replica` stopped for ~35s mid-run:

```
checks_succeeded: 100.00%  (8766 / 8766)
http_req_failed:  0.00%    (threshold rate<0.001 — PASSED)
```

**Zero failed requests through a real replica crash.** Every read that hit the down replica fell back to primary and returned correct data.

| Acceptance criterion | Status |
|---|---|
| Read queries successfully offloaded to the replica database | ✅ Confirmed (live integration test + app logs during load test) |
| API uptime ≥ 99.9% during replica-offline simulation | ✅ Measured 100% success rate during a real ~35s outage |

### 4.2 Latency and throughput (not acceptance criteria, but load-tested findings)

| Run | Target rate | Max VUs | `http_req_failed` | `http_req_duration` p95 | Notes |
|---|---|---|---|---|---|
| Run 1 (initial) | 500 req/s | ~1800 | 79.15% (FAILED) | 18.06s (FAILED) | Replica `pool_timeout=20s` caused 20-36s stalls per request during outage; separately, the single Node process began refusing new TCP connections outright near peak concurrency |
| Run 2 (after pool tuning) | 150 req/s | 592 | 0.00% (PASSED) | 9.23s (FAILED) | Correctness fully recovered; latency still elevated during the outage window |

## 5. Issues identified, with suggested fixes

### 5.1 Replica pool/connect timeout too generous for failover (fixed during this test)

**Symptom:** Run 1 used the same `pool_timeout=20` for the replica as for primary. When the replica died, every read queued up to 20s waiting for a replica connection slot before falling back — 20-36s response times, even though the eventual result was correct.

**Fix applied for testing:** dropped the replica connection string to `pool_timeout=3&connect_timeout=3`, keeping primary's timeouts unchanged:

```
DATABASE_REPLICA_URL=postgresql://user:pass@replica-host:5432/db?connection_limit=20&pool_timeout=3&connect_timeout=3
```

**Recommendation:** carry this asymmetry (short timeouts on the replica, normal timeouts on primary) into whatever real replica URL is used in staging/production. General rule: the replica connection should be tuned to fail fast, since the fallback path (primary) is the source of truth for correctness — there's no benefit to waiting long on a connection that might be genuinely down.

### 5.2 Primary pool sizing doesn't account for 100%-of-traffic failover load

**Symptom:** Run 2 still showed p95=9.23s during the outage window (down from 20-36s, but still high). Root cause: primary's `connection_limit=20` is sized for its normal share of write traffic; during a replica outage, primary suddenly has to absorb both writes AND all read traffic that would normally go to the replica, with no increase in its own pool size.

**Recommendation:**
- Size primary's `connection_limit` for the "replica is down" worst case (i.e., total expected concurrent read+write load), not just its normal write share. This costs nothing extra during normal operation (Prisma only opens connections on demand up to the limit) and buys headroom during a real failover.
- Consider adding a lightweight in-process circuit breaker in `read-replica.router.ts` (e.g., after N consecutive replica failures within a short window, skip attempting the replica for a cooldown period and go straight to primary) to avoid every single in-flight request paying the replica's `connect_timeout` cost individually during a sustained outage. This is optional — correctness already holds without it — but it would reduce the "stampede of simultaneous failed connection attempts" pattern observed in Run 1.

### 5.3 Pre-existing migration-history bug on `dev` (found incidentally, not part of this ticket's scope)

**Symptom:** Running `prisma migrate deploy` against a genuinely fresh database fails at migration `20260713200600_lab_results_and_technician_specialization`:

```
Database error: type "DiagnosticStatus" does not exist
```

That migration does `ALTER TYPE "DiagnosticStatus" ADD VALUE ...`, but on a clean database the type doesn't exist yet at that point in history — likely a casualty of the earlier squashed `20260516055444_current_migration_replay` migration silently dropping the original `CREATE TYPE` statement.

**Impact:** anyone provisioning a genuinely fresh environment (new hire's local DB, a new staging/DR environment, this load-testing exercise) hits this immediately. Existing environments that were incrementally migrated over time never see it, which is why it hasn't surfaced before.

**Suggested fix:** regenerate the migration history from a fresh baseline (`prisma migrate diff` against the current schema, or manually patch the offending migration to `CREATE TYPE "DiagnosticStatus" AS ENUM (...)` if it's missing before the `ALTER TYPE` calls), then verify with `prisma migrate deploy` against a scratch database. Recommend filing this as its own ticket — it's unrelated to read replicas/pooling and shouldn't be silently patched as a side effect of this branch.

**Workaround used for this test only:** `prisma db push` against the local disposable Docker primary, which syncs schema directly and bypasses migration history. Not suitable for any real environment.

### 5.4 Dockerized k6 hit an unrelated Windows NAT bottleneck

**Symptom:** Running k6 via `docker run grafana/k6` against the app on the host (`host.docker.internal:4000`) produced a burst of "connection refused" errors within the first ~10 seconds of ramp-up, well before any real load reached the app.

**Cause:** Docker Desktop for Windows routes `host.docker.internal` traffic through a userspace NAT/proxy layer (vpnkit/WSL2), which has its own concurrent-connection handling limits — a known Docker Desktop limitation, not an application or database issue.

**Fix applied:** installed k6 natively (`winget install k6`) and ran it directly against `localhost:4000`, bypassing the NAT layer entirely. All subsequent numbers in this report are from the native run.

**Recommendation:** always run k6 natively (or from a Linux CI runner) against this app rather than via Docker Desktop's NAT path on Windows; the containerized approach undercounts real capacity.

### 5.5 `nest start --watch` recompile loop (environment-only)

**Symptom:** mid-session, `nest start --watch` got stuck in a "File change detected → recompiling" loop every few seconds and never finished bootstrapping, even with no source edits in flight — most likely Windows Defender / search-indexer touching files under `node_modules`/`dist` and being picked up by the file watcher (chokidar).

**Fix applied:** used a one-shot `npm run build && node dist/main.js` instead of watch mode for load testing. No code change needed; this is purely a local dev-environment quirk, noted here so a future session doesn't waste time on it.

### 5.6 Single-process capacity ceiling (infra sizing, not a code defect)

**Symptom:** In Run 1, at ~1800 concurrent VUs, the single un-clustered `node dist/main.js` process began refusing new TCP connections outright for a few seconds near peak concurrency (confirmed via app logs: the process never crashed and resumed serving successfully once concurrency eased).

**Cause:** one Node process on a single Windows dev machine, no clustering, no reverse proxy queueing in front of it.

**Recommendation:** this is a real, separate finding from the DB-replica work — sustaining a true 500 req/s in production will need horizontal scaling (Node cluster mode / PM2 in cluster mode, or multiple app instances behind a load balancer), independent of anything in this ticket. Not something to "fix" as part of read-replica routing.

### 5.7 CRLF line endings broke the Docker init scripts (fixed)

**Symptom:** `docker/pg-primary/init-replication.sh` and `docker/pg-replica/entrypoint.sh` got converted to CRLF line endings by git's `core.autocrlf=true` on Windows during a `git stash`/`pop` round-trip, which breaks the shebang line inside the Linux containers (`/bin/bash^M: bad interpreter`).

**Fix applied:** added [.gitattributes](../.gitattributes) forcing `text eol=lf` for `*.sh` and Dockerfiles, and normalized the currently-checked-out files. This prevents the same corruption for any other Windows contributor.

## 6. Summary

The read-replica routing and fallback logic is correct and load-tested: reads are offloaded to the replica when it's healthy, and the API maintains 100% availability through a real ~35s replica outage under sustained load — both acceptance criteria are met. The exercise also surfaced (and in most cases fixed) several tuning and environment issues along the way: replica timeout tuning (fixed), primary pool sizing for failover load (recommendation, not yet applied), a pre-existing migration-history bug on `dev` (flagged, not fixed — out of scope), and two local-environment-only artifacts (Docker Desktop NAT bottleneck, file-watcher loop) that don't affect the real application.
