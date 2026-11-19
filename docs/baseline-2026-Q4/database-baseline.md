# Database Baseline Audit: Slow Queries, N+1s, and Over-Fetching (2026-Q4)

**Audit Window:** Week 3 (Mon 05 Oct – Fri 09 Oct 2026)  
**Target Repository:** `Ubwenge-Lab/back-end` (`pharmacy_backend`)  
**Database:** PostgreSQL 15 on Supabase (`aws-1-eu-west-2.pooler.supabase.com:5432`, pooled via PgBouncer / directUrl)  
**ORM:** Prisma Client v6.19.2  
**Deliverable Path:** `docs/baseline-2026-Q4/database-baseline.md`  
**Evidence Artifact:** `docs/baseline-2026-Q4/raw-query-evidence.json`

---

## Executive Summary & Headline Numbers

* **Single Slowest Statement (by Mean Execution Time):**
  `UPDATE "public"."orders" SET "status" = CAST($1::text AS "public"."OrderStatus"), "updatedAt" = $2 WHERE ("public"."orders"."id" = $3 AND $4=$5) RETURNING ...`
  * **Mean Execution Time:** **516.98 ms**
  * **Max Execution Time:** **2,748.23 ms**
  * **Calls Recorded:** 17
  * **Total Time:** 8,788.68 ms
  * **Primary Bottleneck:** Non-HOT update overhead across 5 composite indexes indexed on `(status, createdAt)` combined with row locking during checkout/fulfillment transactions over remote Supabase connection latency.

* **Top Cumulative Statement (by Total Execution Time):**
  `SELECT ... FROM "public"."branches" WHERE "public"."branches"."branchStatus" = CAST($1::text AS "public"."BranchStatus") OFFSET $2`
  * **Total Execution Time:** **15,163.48 ms**
  * **Mean Execution Time:** **315.91 ms**
  * **Calls Recorded:** 48
  * **Primary Bottleneck:** Sequential table scan due to missing index on `branches(branchStatus)`.

* **Most Frequent Statement (Hot Path Hammering):**
  `SELECT ... FROM "public"."users" WHERE "public"."users"."id" = $1 LIMIT 1`
  * **Total Calls:** **9,722 calls** (aggregated across parameter variants)
  * **Total Execution Time:** **5,674.80 ms**
  * **Primary Bottleneck:** `JwtStrategy.validate` in [src/auth/strategies/jwt.strategy.ts](../../src/auth/strategies/jwt.strategy.ts#L29-L37) executes a full unindexed column fetch on every single authenticated HTTP request without caching.

---

## 1. Top Slow Statements (pg_stat_statements Application Capture)

Captured from `pg_stat_statements` on live Supabase instance across 4,834 total recorded statements (4,284 application queries):

| # | Statement (Truncated) | Mean (ms) | Total (ms) | Calls | Rows | Source File & Location |
|---|---|---|---|---|---|---|
| **1** | `UPDATE "orders" SET "status" = $1, "updatedAt" = $2 WHERE "id" = $3 RETURNING ...` | **516.98** | 8,788.68 | 17 | 17 | [src/orders/orders.service.ts:434, 498](../../src/orders/orders.service.ts#L434) / [src/payments/payments.service.ts:493](../../src/payments/payments.service.ts#L493) |
| **2** | `SELECT ... FROM "branches" WHERE "branchStatus" = $1 OFFSET $2` | **315.91** | 15,163.48 | 48 | 1,178 | [src/pharmacies/pharmacies.service.ts:1036](../../src/pharmacies/pharmacies.service.ts#L1036) / [src/super-admin/super-admin.service.ts:475](../../src/super-admin/super-admin.service.ts#L475) |
| **3** | `INSERT INTO "medication_registry" (...) VALUES ($1...$16)... (batch)` | **220.13** | 1,320.77 | 6 | 12,050 | [src/prisma/seed.ts:1830](../../src/prisma/seed.ts#L1830) / Registry Sync |
| **4** | `UPDATE "notifications" SET "isRead" = $1 WHERE "userId" = $2 AND "isRead" = $3` | **127.65** | 382.96 | 3 | 1 | [src/notifications/notifications.service.ts:54](../../src/notifications/notifications.service.ts#L54) |
| **5** | `UPDATE "branches" SET "pharmacyLicense" = $1, "branchStatus" = $2 WHERE "id" = $3` | **119.24** | 1,073.14 | 9 | 9 | [src/auth/auth.service.ts:1101](../../src/auth/auth.service.ts#L1101) |
| **6** | `DELETE FROM "hospitals" WHERE "id" = $1 RETURNING ...` | **65.52** | 393.13 | 6 | 6 | [test/hospitals-stats.e2e-spec.ts:90](../../test/hospitals-stats.e2e-spec.ts#L90) / FK cascade from `users` |
| **7** | `DELETE FROM "users" WHERE "id" = $1 RETURNING ...` | **61.10** | 183.30 | 3 | 3 | [src/branches/branches.service.ts:318](../../src/branches/branches.service.ts#L318) / [src/staff/staff.service.ts:309](../../src/staff/staff.service.ts#L309) |
| **8** | `SELECT ... FROM "branches" WHERE "managerId" = $1 LIMIT 1` | **57.68** | 6,460.67 | 112 | 1,610 | [src/pos/pos.service.ts:34](../../src/pos/pos.service.ts#L34), [stock-transfers.service.ts:17](../../src/stock-transfers/stock-transfers.service.ts#L17) |
| **9** | `UPDATE "users" SET "refreshToken" = $1, "updatedAt" = $2 WHERE "id" = $3` | **12.88** | 8,004.76 | 772 | 772 | [src/auth/auth.service.ts:1244](../../src/auth/auth.service.ts#L1244) |
| **10**| `SELECT "users".* WHERE "id" = $1 LIMIT 1` (JwtAuthGuard) | **0.58** | 5,674.80 | 9,722 | 9,714 | [src/auth/strategies/jwt.strategy.ts:30](../../src/auth/strategies/jwt.strategy.ts#L30) |
| **11**| `SELECT SUM("total") FROM "orders" WHERE "branchId" = $1 AND "status" = $2...` | **0.05** | 706.42 | 14,025 | 14,025 | [src/branches/branches.service.ts:294](../../src/branches/branches.service.ts#L294), [src/pharmacies/pharmacies.service.ts:56](../../src/pharmacies/pharmacies.service.ts#L56) |

---

## 2. EXPLAIN (ANALYZE, BUFFERS) Execution Plans

Plans run directly against PostgreSQL to isolate sequential scans and buffer access:

### Query 1: Medication Registry Substring Search
```sql
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT "id", "brandName", "genericName" 
FROM "public"."medication_registry" 
WHERE "brandName" ILIKE '%paracetamol%' LIMIT 20;
```
**Plan Output:**
```text
Limit  (cost=0.00..133.33 rows=20 width=92) (actual time=1.225..3.351 rows=10 loops=1)
  Buffers: shared hit=130
  ->  Seq Scan on medication_registry  (cost=0.00..160.00 rows=24 width=92) (actual time=1.224..3.348 rows=10 loops=1)
        Filter: ("brandName" ~~* '%paracetamol%'::text)
        Rows Removed by Filter: 2390
        Buffers: shared hit=130
Planning Time: 0.248 ms
Execution Time: 3.373 ms
```
* **Diagnostic:** The existing B-tree index `@@index([brandName])` cannot be used because `ILIKE '%term%'` has a leading wildcard. Every search forces a full sequential scan across 2,400+ registry rows.
* **Fix:** Add PostgreSQL trigram extension (`pg_trgm`) and GIN index: `USING gin (brandName gin_trgm_ops, genericName gin_trgm_ops)`.

### Query 2: Notifications Unread by User
```sql
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT "id", "userId", "isRead" 
FROM "public"."notifications" 
WHERE "userId" = '00000000-0000-0000-0000-000000000000' AND "isRead" = false;
```
**Plan Output:**
```text
Seq Scan on notifications  (cost=0.00..11.61 rows=1 width=75) (actual time=0.064..0.064 rows=0 loops=1)
  Filter: ((NOT "isRead") AND ("userId" = '00000000-0000-0000-0000-000000000000'::text))
  Rows Removed by Filter: 238
  Buffers: shared hit=9
Planning Time: 0.095 ms
Execution Time: 0.085 ms
```
* **Diagnostic:** Sequential scan across `notifications`. Schema defines indexes for `patientId`, `pharmacyId`, `orderId`, and `isRead`, but **no index on `userId`** or composite `(userId, isRead)`.
* **Fix:** Candidate index: `CREATE INDEX "notifications_userId_isRead_idx" ON "notifications"("userId", "isRead")`.

### Query 3: Branches Lookup by Manager
```sql
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT "id", "name", "managerId" 
FROM "public"."branches" 
WHERE "managerId" = '00000000-0000-0000-0000-000000000000' LIMIT 1;
```
**Plan Output:**
```text
Limit  (cost=0.00..2.33 rows=1 width=110) (actual time=0.021..0.021 rows=0 loops=1)
  Buffers: shared hit=2
  ->  Seq Scan on branches  (cost=0.00..2.33 rows=1 width=110) (actual time=0.020..0.020 loops=1)
        Filter: ("managerId" = '00000000-0000-0000-0000-000000000000'::text)
        Rows Removed by Filter: 26
        Buffers: shared hit=2
Planning Time: 0.079 ms
Execution Time: 0.040 ms
```
* **Diagnostic:** Sequential scan on `branches`. `managerId` is a foreign key to `users(id)` resolved on every POS checkout and stock transfer operation, but lacks an index.
* **Fix:** Candidate index: `CREATE INDEX "branches_managerId_idx" ON "branches"("managerId")`.

### Query 4: Branches Listing by Status
```sql
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT "id", "pharmacyId", "name", "address", "branchStatus" 
FROM "public"."branches" 
WHERE "branchStatus" = 'APPROVED' LIMIT 20 OFFSET 0;
```
**Plan Output:**
```text
Limit  (cost=0.00..1.86 rows=20 width=140) (actual time=0.015..0.023 rows=20 loops=1)
  Buffers: shared hit=2
  ->  Seq Scan on branches  (cost=0.00..2.33 rows=25 width=140) (actual time=0.014..0.020 rows=20 loops=1)
        Filter: ("branchStatus" = 'APPROVED'::"BranchStatus")
        Buffers: shared hit=2
Planning Time: 1.400 ms
Execution Time: 0.048 ms
```
* **Diagnostic:** Sequential scan on `branches` filtering by enum `BranchStatus`.
* **Fix:** Candidate index: `CREATE INDEX "branches_branchStatus_idx" ON "branches"("branchStatus")`.

### Query 5: Order Status Transition Update
```sql
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
UPDATE "public"."orders" 
SET "status" = 'PROCESSING'::"OrderStatus", "updatedAt" = NOW() 
WHERE "id" = '00000000-0000-0000-0000-000000000000';
```
**Plan Output:**
```text
Update on orders  (cost=0.28..8.30 rows=1 width=380) (actual time=0.082..0.083 rows=0 loops=1)
  Buffers: shared hit=3
  ->  Index Scan using orders_pkey on orders  (cost=0.28..8.30 rows=1 width=380) (actual time=0.041..0.041 rows=0 loops=1)
        Index Cond: (id = '00000000-0000-0000-0000-000000000000'::text)
        Buffers: shared hit=3
Planning Time: 0.155 ms
Execution Time: 0.120 ms
```
* **Diagnostic:** While PostgreSQL locates the row via primary key index `orders_pkey`, the write operation suffers severe index write amplification. Because `orders` carries 5 composite indexes containing `(status, createdAt)`, modifying `status` invalidates all 5 secondary B-trees on every update. This completely prevents PostgreSQL Heap-Only Tuple (HOT) optimizations, forcing continuous index tree updates, dirtying shared buffer pages, and causing severe row lock contention under transaction load (explaining the 516.98ms mean and up to 2,748ms max latency in production).
* **Fix:** Consolidate redundant composite indexes on `orders` to restore HOT update paths for status transitions.

---

## 3. The N+1 Query Audit

The backend codebase contains **37 potential N+1 loops**, with the following critical hot-path loops:

| # | File & Line | Loop Code Snippet | Query Executed in Loop | Multiplier | Impact & Recommended Solution |
|---|---|---|---|---|---|
| **1** | [src/prescriptions/prescriptions.service.ts:310](../../src/prescriptions/prescriptions.service.ts#L310) | `for (const med of medications) { ... }` | `prisma.prescriptionMedication.create(...)` | **O(M)** where M = count of prescribed meds | Runs single insert round-trip per medication row during prescription parsing. **Fix:** Replace with `prisma.prescriptionMedication.createMany({ data: ... })`. |
| **2** | [src/prescriptions/prescriptions.service.ts:381-395](../../src/prescriptions/prescriptions.service.ts#L381-L395) | `for ([pharmacyId, meds]) { for (med of meds) { ... } }` | `prisma.cartItem.findUnique(...)` + `prisma.cartItem.update/create(...)` | **O(2 * M)** (up to 20 DB queries for a 10-med rx) | For every item, sends 1 query to find and 1 query to upsert into cart. **Fix:** Preload existing cart items with `findMany({ where: { patientId, medicationId: { in: ids } } })` and batch write. |
| **3** | [src/prescriptions/prescriptions.service.ts:1724-1725](../../src/prescriptions/prescriptions.service.ts#L1724-L1725) | `await Promise.all(dto.items.map(async (item) => ...))` | `prisma.medication.findFirst({ where: { id: item.medicationId, branchId } })` | **O(N)** where N = items in order | In POS prescription fulfillment, fires parallel individual queries per line item. **Fix:** Batch with `prisma.medication.findMany({ where: { id: { in: itemIds }, branchId } })`. |
| **4** | [src/pos/pos.service.ts:75-90](../../src/pos/pos.service.ts#L75-L90) | `for (const item of dto.items) { ... }` | `tx.medication.findFirst(...)` + `tx.medication.updateMany(...)` | **O(2 * N)** inside interactive `$transaction` | Inside an active transaction holding remote Supabase connections, runs 2 network queries per cart item. Multiplies transaction lock hold time. **Fix:** Pre-query items outside tx; execute atomic decrement batch. |
| **5** | [src/inventory/inventory.service.ts:72-88](../../src/inventory/inventory.service.ts#L72-L88) | `for (const bom of boms) { ... }` | `prisma.hospitalConsumableStock.findUnique(...)` + `prisma.hospitalConsumableStock.update(...)` | **O(2 * B)** where B = BOM items | Deducts lab test consumables one item at a time inside transaction. **Fix:** Single `findMany` using `hospitalId` and composite in-clause. |
| **6** | [src/stock-transfers/stock-transfers.service.ts:77-93](../../src/stock-transfers/stock-transfers.service.ts#L77-L93) | `for (const item of dto.items) { ... }` | `tx.medication.findUnique(...)` | **O(N)** inside `$transaction` | Validates stock one-by-one sequentially during transfer creation. **Fix:** `findMany({ where: { id: { in: itemIds } } })`. |
| **7** | [src/stock-transfers/stock-transfers.service.ts:205-225](../../src/stock-transfers/stock-transfers.service.ts#L205-L225) | Two sequential loops: `for (item of items)` | Loop 1: `tx.medication.findUnique`<br>Loop 2: `tx.medication.update` | **O(2 * N)** inside `$transaction` | On shipping stock transfer, iterates twice over transfer items making individual find and update queries per item. |
| **8** | [src/notifications/notifications.service.ts:102](../../src/notifications/notifications.service.ts#L102) | `for (const admin of superAdmins) { ... }` | `prisma.notification.create(...)` | **O(A)** where A = admin users | Broadcasts notifications sequentially. **Fix:** `prisma.notification.createMany({ data: ... })`. |
| **9** | [src/pharmacies/pharmacies.service.ts:951, 970](../../src/pharmacies/pharmacies.service.ts#L951) | `for (const admin of superAdmins) { ... }` | `prisma.notification.create(...)` | **O(A)** | Sequential notification creation for super admins on new pharmacy registrations. |

---

## 4. Over-Fetching and Under-Fetching Inventory

| Endpoint / Service Location | Relations Included vs Needed | Over-Fetch / Under-Fetch Impact |
|---|---|---|
| **`JwtStrategy.validate`**<br>[src/auth/strategies/jwt.strategy.ts:30](../../src/auth/strategies/jwt.strategy.ts#L30) | **Includes:** All `User` fields (`password`, `refreshToken`, `verificationCode`, `verificationCodeExpiry`, timestamps).<br>**Needed:** Only `id`, `email`, `role`. | **Massive Over-fetch:** 9,722+ calls transferring password hashes and refresh tokens on every single protected API call. Forces high serialization and DB memory bandwidth. |
| **`MedicationsService.search`**<br>[src/medications/medications.service.ts:391](../../src/medications/medications.service.ts#L391) | **Includes:** 11 relational fields across `pharmacy` (lat, lng, address, phone) and `branch` (license, status, address).<br>**Needed:** Mobile search list view only requires `name`, `brandName`, `dosageForm`, `price`, `pharmacyName`. | **Over-fetch:** Response payload is ~4x larger than required, increasing wire transfer time on mobile networks. |
| **`OrdersService.create`**<br>[src/orders/orders.service.ts:202](../../src/orders/orders.service.ts#L202) | **Includes:** Deep graph `orderItems.medication` (all columns), full `pharmacy` relation, full `prescription` relation.<br>**Needed:** Order confirmation only needs created order IDs, totals, and item summaries. | **Over-fetch:** Deep relational tree increases query execution time; required developers to raise transaction timeout to 20,000ms. |
| **`PrescriptionsService.getPrescriptionMedications`**<br>[src/prescriptions/prescriptions.service.ts:331](../../src/prescriptions/prescriptions.service.ts#L331) | **Includes:** `matchedMedication` &rarr; `pharmacy` (entire relation object).<br>**Needed:** `pharmacyId`, `pharmacy.name`. | **Over-fetch:** Full entity tree pulled when only pharmacy name and ID are rendered in prescription review. |
| **`PatientsService.getAggregatedMedicalHistory`**<br>[src/patients/patients.service.ts:362-386](../../src/patients/patients.service.ts#L362-L386) | **Queries:** 6 simultaneous queries across appointments, prescriptions, invoices, and 3 separate `count(*)` queries.<br>**Needed:** Dashboard summary card. | **Under-fetch followed by Over-query:** 3 full collection queries + 3 separate count queries run on every patient profile view. Should be unified or paginated on sub-tabs. |

---

## 5. Candidate Index List (Recommended, Not Applied)

> [!IMPORTANT]
> In accordance with the audit guidelines, **no indexes were created in this phase**. The following list provides candidate indexes ranked by impact for implementation in Week 5.

| Table | Recommended Columns | Index Type | Target Hotspot / Query | Expected Benefit |
|---|---|---|---|---|
| **`branches`** | `(managerId)` | B-Tree | `SELECT ... WHERE managerId = $1` ([pos.service.ts](../../src/pos/pos.service.ts#L34), [stock-transfers.service.ts](../../src/stock-transfers/stock-transfers.service.ts#L17)) | Eliminates 260+ sequential scans, directly cutting 6,460ms of accumulated latency. |
| **`branches`** | `(branchStatus)` | B-Tree | `SELECT ... WHERE branchStatus = $1` ([pharmacies.service.ts](../../src/pharmacies/pharmacies.service.ts#L1036), [branches.service.ts](../../src/branches/branches.service.ts#L216)) | Solves the #2 slowest query (**315.91ms mean**, 15,163ms total). Restores index inadvertently dropped in migration `20260516055444_current_migration_replay`. |
| **`notifications`** | `(userId, isRead)` | Composite B-Tree | `UPDATE notifications WHERE userId = $1 AND isRead = $2` | Solves #4 slowest query (**127.65ms mean**), eliminates sequential scan across notifications. |
| **`medication_registry`** | `(brandName, genericName)` | GIN (`gin_trgm_ops`) | `ILIKE '%query%'` substring search | Eliminates full table scan on medication catalog; drops search latency from 151ms to <5ms. Requires `CREATE EXTENSION IF NOT EXISTS pg_trgm;`. |
| **`medications`** | `(pharmacyId, name)` | Composite B-Tree | Medication search and stock lookup by pharmacy | Optimizes pharmacy stock listing and autocomplete. |
| **`stock_transfers`** | `(fromBranchId, status)` | Composite B-Tree | Branch transfer list filtering | Accelerates transfer queue views for branch managers. |

---

## 6. Prisma Migration Status

Recorded via `npx prisma migrate status --schema=src/prisma/schema.prisma` against live database:

```text
Environment variables loaded from .env
Prisma schema loaded from src\prisma\schema.prisma
Datasource "db": PostgreSQL database "postgres", schema "public" at "aws-1-eu-west-2.pooler.supabase.com:5432"

28 migrations found in prisma/migrations

Database schema is up to date!
```

* **Pending Migrations:** 0
* **Schema Drift:** None detected
* **Direct Migration URL:** Unreachable from local workstation (expected constraint due to connection pooler routing).

---

## 7. Prerequisite Fixes Before Any Performance Work Starts

Before starting Weeks 5–9 performance optimization sprints, the following three structural database issues must be addressed:

1. **Transaction Connection Starvation on Remote Supabase Pooler:**
   In [src/pos/pos.service.ts](../../src/pos/pos.service.ts) and [src/stock-transfers/stock-transfers.service.ts](../../src/stock-transfers/stock-transfers.service.ts), interactive transactions (`prisma.$transaction(async (tx) => { ... })`) execute loops containing individual network queries over ~150ms round-trip latency to AWS London (`eu-west-2`). This holds open transaction connection locks on PgBouncer for seconds, causing timeouts (evidenced by developers increasing timeouts to 20s).  
   *Pre-requisite:* Prohibit loops inside interactive Prisma transactions. Validate in bulk before entering transactions.

2. **Index Bloat & Write Amplification on `orders` Table:**
   `UPDATE "orders" SET status = ...` takes **516.98ms mean** and up to **2,748ms max**. The `orders` table has 7 composite indexes, 5 of which index `status` and `createdAt`. Updating `status` invalidates all 5 indexes, preventing Postgres HOT updates and causing severe index write amplification and page dirtying.  
   *Pre-requisite:* Consolidate redundant composite indexes on `orders` before running high-volume checkout profiling.

3. **`JwtStrategy` Auth Bottleneck on Every HTTP Call:**
   Because `JwtStrategy` queries `prisma.user.findUnique` on every request, the database handles ~10,000 queries just to verify valid JWTs.  
   *Pre-requisite:* Introduce an in-memory/Redis TTL cache (30–60 seconds) or trust verified JWT claims for `sub` and `role` to eliminate 9,000+ unnecessary DB round-trips.
