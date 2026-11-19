# Ranked Bottleneck List (2026-Q4)
**Repository:** `Ubwenge-Lab/back-end`  
**Evaluation Formula:** $\text{Priority Score} = \text{Impact Score} \times \text{Feasibility / Cost Efficiency}$  
**Target Execution Window:** Weeks 6 to 9 (Execution Phase)  
**Sign-off:** Chief Technology Officer (CTO)

---

## 1. Prioritization Methodology

Every identified bottleneck from the Week 2–4 audits was scored along two axes:

1. **User-Facing Impact Score (1 to 5):**
   * **5 = Critical Revenue / Core Flow:** High-concurrency commercial path directly tied to cash collection or patient care (e.g., POS checkout, prescription dispatch). Slowness causes dropped sales, checkout lines, or cart abandonment.
   * **4 = High Traffic Operation:** Hot-path API endpoints invoked by multiple roles throughout the working day (e.g., JWT authentication guard, medication search).
   * **3 = Moderate Traffic:** Workflow operations executed periodically by staff (e.g., stock transfers, patient medical record review).
   * **2 = Low-Frequency / Internal:** Operations performed occasionally by administrative roles (e.g., pharmacy license status changes, hospital consumable BOM updates).
   * **1 = Edge Case / Rare:** Operations executed rarely or during onboarding.

2. **Cost & Effort to Fix:**
   * **Small (S):** 1 to 2 developer days. Low complexity; standard index additions, query restructuring, pre-filtering, or in-memory caching.
   * **Medium (M):** 3 to 5 developer days. Moderate complexity; batch query refactoring, state machine rework, or transaction boundary redesign.
   * **Large (L):** > 5 developer days (1 to 2 weeks). High architectural complexity; schema reorganization, cross-service coordination, or breaking API contract changes.

3. **ROI Ranking Metric:**
   Items with **High Impact** and **Small Cost** represent immediate, high-leverage wins and are scheduled first in Week 6. Items with High Impact and Medium Cost follow in Weeks 7 and 8.

---

## 2. Master Ranked Bottleneck Matrix

| Rank | Bottleneck Description | Subsystem & File Location | Impact (1–5) | Cost (S/M/L) | Priority | Expected Latency Reduction / ROI | Execution Sprint |
|---|---|---|---|---|---|---|---|
| **#1** | **`orders` Status Update Write Amplification**<br>5 redundant composite indexes invalidate Postgres HOT updates during order status transitions. | Database / Checkout<br>[src/orders/orders.service.ts](../../src/orders/orders.service.ts#L434) | **5 (Critical)** | **Small** (1.5d) | **P0 (Immediate)** | Mean latency drops from **516.98ms** to **<25ms**; eliminates lock timeouts at POS counter. | **Week 6** |
| **#2** | **Missing B-Tree Index on `branches(branchStatus)`**<br>Full sequential scan on branches table whenever active pharmacies or branches are queried. | Database / Directories<br>[src/pharmacies/pharmacies.service.ts](../../src/pharmacies/pharmacies.service.ts#L1036) | **4 (High)** | **Small** (0.5d) | **P0 (Immediate)** | Eliminates **15,163ms** of cumulative DB wait time; query latency drops from **315ms** to **<3ms**. | **Week 6** |
| **#3** | **Uncached User Identity DB Lookups in `JwtAuthGuard`**<br>`JwtStrategy.validate` queries `users` table on every single authenticated HTTP call (9,722 calls recorded). | Auth / API Gateway<br>[src/auth/strategies/jwt.strategy.ts](../../src/auth/strategies/jwt.strategy.ts#L30) | **5 (Critical)** | **Small** (1.5d) | **P0 (Immediate)** | Shaves **15–30ms** network round-trip off **100%** of authenticated API endpoints. | **Week 6** |
| **#4** | **Missing Composite Index on `notifications(userId, isRead)`**<br>Sequential scan across notifications table on every mark-as-read and unread count query. | Notifications<br>[src/notifications/notifications.service.ts](../../src/notifications/notifications.service.ts#L54) | **3 (Medium)** | **Small** (0.5d) | **P1 (High)** | Query latency drops from **127.65ms** to **<2ms**; resolves UI notification lag. | **Week 6** |
| **#5** | **Medication Registry Substring Sequential Scan**<br>`ILIKE '%term%'` wildcard bypasses standard B-tree index, scanning 2,400+ registry rows. | Medications Search<br>[src/prisma/seed-registry.ts](../../src/prisma/seed-registry.ts) | **4 (High)** | **Small** (1d) | **P1 (High)** | Adding `pg_trgm` GIN index cuts autocomplete latency from **151ms** to **<4ms**. | **Week 7** |
| **#6** | **POS Cart N+1 Interactive Transaction Loop**<br>Sequential `findFirst` + `updateMany` for each cart item inside an active Prisma `$transaction`. | POS Terminal<br>[src/pos/pos.service.ts](../../src/pos/pos.service.ts#L75-L90) | **5 (Critical)** | **Medium** (3d) | **P1 (High)** | Reduces transaction hold time from **1,850ms** to **<120ms**; prevents Supabase pool exhaustion. | **Week 7** |
| **#7** | **Prescription Line-Item Sequential Inserts (N+1)**<br>Single `prisma.prescriptionMedication.create` called in a loop for each prescribed medication. | Prescriptions<br>[src/prescriptions/prescriptions.service.ts](../../src/prescriptions/prescriptions.service.ts#L310) | **4 (High)** | **Small** (1d) | **P1 (High)** | Batching via `createMany` reduces prescription parsing time by **70%** (from 680ms to <150ms). | **Week 7** |
| **#8** | **Sequential Stock Transfer Verification & Shipping Loops**<br>Two sequential loops inside `$transaction` executing individual find and update queries per item. | Stock Management<br>[src/stock-transfers/stock-transfers.service.ts](../../src/stock-transfers/stock-transfers.service.ts#L77-L93) | **3 (Medium)** | **Medium** (2.5d) | **P2 (Medium)** | Cuts stock transfer confirmation latency from **1,200ms** to **<200ms**; eliminates lock deadlocks. | **Week 8** |
| **#9** | **Deep Over-Fetching on Medication Search Results**<br>Returns 11 relational fields across `pharmacy` and `branch` when client only renders card summaries. | Mobile API<br>[src/medications/medications.service.ts](../../src/medications/medications.service.ts#L391) | **4 (High)** | **Small** (1d) | **P2 (Medium)** | Drops mobile response payload by **75%** (from 380 KB to 95 KB), drastically cutting TTFB on 3G. | **Week 8** |
| **#10**| **Order Creation Relational Tree Over-Fetching**<br>Eagerly includes full nested relation trees, forcing transaction timeouts up to 20,000ms. | Orders / Checkout<br>[src/orders/orders.service.ts](../../src/orders/orders.service.ts#L202) | **5 (Critical)** | **Medium** (3d) | **P2 (Medium)** | Cuts order placement DB query duration from **1,400ms** to **<250ms**. | **Week 8** |
| **#11**| **Missing Index on `branches(managerId)`**<br>Foreign key lookup on every POS operation and stock dispatch scans entire `branches` table. | Branches / Auth<br>[src/pos/pos.service.ts](../../src/pos/pos.service.ts#L34) | **3 (Medium)** | **Small** (0.5d) | **P2 (Medium)** | Eliminates **6,460ms** cumulative sequential scan time across 112 calls. | **Week 8** |
| **#12**| **Patient Profile 6-Query Aggregation Waterfall**<br>Runs 3 full collections + 3 independent `count(*)` queries on every patient dashboard visit. | Patients / Clinical<br>[src/patients/patients.service.ts](../../src/patients/patients.service.ts#L362-L386) | **3 (Medium)** | **Medium** (3d) | **P3 (Deferred)**| Consolidates 6 database round-trips into a single CTE query or cached summary card. | **Week 9** |
| **#13**| **Sequential Admin Notification Broadcast Loop**<br>Iterates over super-admin user list executing individual insert queries per administrator. | Notifications<br>[src/notifications/notifications.service.ts](../../src/notifications/notifications.service.ts#L102) | **2 (Low)** | **Small** (1d) | **P3 (Deferred)**| Replaces sequential round-trips with `createMany`, preventing connection spikes on system events. | **Week 9** |

---

## 3. High-Leverage Execution Sprints Summary

```
Week 6 (Quick-Wins / P0):
  * Bottleneck #1: Consolidate `orders` composite indexes (HOT update restoration)
  * Bottleneck #2: Add B-Tree index on `branches(branchStatus)`
  * Bottleneck #3: In-memory LRU cache for `JwtAuthGuard`
  * Bottleneck #4: Add composite index on `notifications(userId, isRead)`

Week 7 (Hot-Path Core / P1):
  * Bottleneck #5: Trigram GIN index for medication search
  * Bottleneck #6: Batch queries in POS cart interactive transactions
  * Bottleneck #7: Batch prescription line items via `createMany`

Week 8 (Data Flow & Payload Optimization / P2):
  * Bottleneck #8: Batch stock transfer item validation & shipping
  * Bottleneck #9: Field selection pruning on medication search
  * Bottleneck #10: Prune deep relation trees in `OrdersService.create`
  * Bottleneck #11: Add index on `branches(managerId)`

Week 9 (Aggregation & Polish / P3):
  * Bottleneck #12: Consolidated patient medical history CTE query
  * Bottleneck #13: Admin notification broadcast batching
```

---

*Sign-off confirms that Weeks 6 to 9 will execute exclusively against this prioritized list.*

