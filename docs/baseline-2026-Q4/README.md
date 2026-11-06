# Baseline Pack v1 (2026-Q4)
**Repository:** `Ubwenge-Lab/back-end` & Ecosystem  
**Target Window:** 2026-Q4 Performance Optimization (Weeks 4 to 9)  
**Publication Gate:** Sunday 01 Nov 2026  
**Auditor / Lead:** Adeline Tuyizere (Backend Lead)  
**Sign-off:** Chief Technology Officer (CTO)

---

## Executive Overview

The **Baseline Pack v1** is the definitive reference artifact against which every performance fix, refactoring effort, and latency reduction in Q4 2026 will be judged.

In Week 5, engineering stopped building speculative features to measure, audit, and benchmark every layer of the platform across seven core domains:
1. **Frontend**: Lighthouse performance and Core Web Vitals across client surfaces.
2. **API**: P50, P95, and P99 latency benchmarks across critical HTTP endpoints.
3. **Database**: Slow queries, sequential table scans, N+1 query loops, write amplification, and connection pool starvation.
4. **Bundle Sizes**: Compressed and uncompressed production JavaScript and CSS asset payloads.
5. **Errors (Sentry)**: Unhandled exception rates, transaction crash rates, and client error surges.
6. **UX Defect Audit**: Visual regression gallery, blocking layout shifts, and client interaction defect inventory.
7. **Impact Ranking**: Cost-versus-impact prioritization mapping technical bottlenecks directly to user traffic and commercial revenue.

---

## Master Artifact Index

All seven baseline domains are cataloged below. Every measurement explicitly records the **capture date**, the **environment**, and the **responsible owner**.

| # | Domain Artifact | Measurement Window | Target Environment | Key Benchmark Metric | File / Reference Link |
|---|---|---|---|---|---|
| **1** | **Database Baseline Audit** | 05 Oct – 09 Oct 2026 (W3) | Supabase PostgreSQL 15 (`aws-1-eu-west-2.pooler.supabase.com:5432`) | Top slow query: **516.98ms** mean / **2,748ms** max; 37 N+1 loops | [database-baseline.md](./database-baseline.md) |
| **2** | **Raw Query Evidence** | 05 Oct – 09 Oct 2026 (W3) | Supabase `pg_stat_statements` application capture (4,284 queries) | 48 sequential scan calls on `branches`; 9,722 uncached JWT lookups | [raw-query-evidence.json](./raw-query-evidence.json) |
| **3** | **Ranked Bottlenecks List** | 26 Oct – 30 Oct 2026 (W5) | Cross-System Production & Load Test Synthesis | Prioritized by $\text{Impact} \times \text{Cost}$ across all 10 surfaces | [bottlenecks-ranked.md](./bottlenecks-ranked.md) |
| **4** | **Surface Impact Ranking** | 19 Oct – 23 Oct 2026 (W4) | Production Client Analytics & Commercial Telemetry | 10 client surfaces ranked by business volume & top 3 money losers | [surface-impact-ranking.md](./surface-impact-ranking.md) |
| **5** | **API Latency Baseline** | 12 Oct – 16 Oct 2026 (W4) | Render Production Backend (`api.ubwenge.com`, warm instances) | Auth P95: **420ms**; POS Checkout P95: **1,840ms**; Rx Search: **610ms** | [api-latency-baseline.md](./api-latency-baseline.md) |
| **6** | **Frontend Lighthouse Audit** | 12 Oct – 16 Oct 2026 (W4) | Google Chrome Lighthouse v12 (Simulated 4G, Desktop & Mobile) | POS Counter: **48/100**; Patient Portal: **54/100**; Admin: **62/100** | [frontend-lighthouse.md](./frontend-lighthouse.md) |
| **7** | **Bundle Size Analysis** | 19 Oct – 23 Oct 2026 (W4) | Webpack Production Build Analyzer (`pharmacy_front` dist) | Initial Vendor JS: **1.84 MB** (uncompressed) / **482 KB** (gzip) | [bundle-size-analysis.md](./bundle-size-analysis.md) |
| **8** | **Sentry Error Audit** | 19 Oct – 23 Oct 2026 (W4) | Sentry Production Project (`ubwenge-backend` & `ubwenge-client`) | Unhandled 500 error rate: **2.3%**; Top spike: DB Pool Timeout | [sentry-error-audit.md](./sentry-error-audit.md) |
| **9** | **UX Defect Gallery & Log** | 19 Oct – 23 Oct 2026 (W4) | Client Field Audit (Kigali & Kampala pilot pharmacy counters) | 18 blocking interaction defects; 4 layout shift regressions | [ux-defects-inventory.md](./ux-defects-inventory.md) |
| **10**| **Denominator Lock & Math** | 26 Oct – 30 Oct 2026 (W5) | Q4 Management Plan Reconciled | **29 verified items** locked; Target 90% = **26 items** at ~6%/week | [denominator-lock.md](./denominator-lock.md) |
| **11**| **Explicit Out-of-Scope** | 26 Oct – 30 Oct 2026 (W5) | Engineering Architecture Board Agreement | Guardrail freezing Q4 boundaries to prevent post-hoc defect claims | [out-of-scope.md](./out-of-scope.md) |

---

## Summary of Top 3 System Bottlenecks

From the comprehensive cross-domain audit, the top three technical bottlenecks causing direct commercial loss and customer friction are:

1. **`orders` Status Update Write Amplification (Database / POS Surface)**
   * **Metric:** Mean execution time **516.98 ms**, maximum **2,748.23 ms** under counter traffic.
   * **Root Cause:** Five secondary composite B-tree indexes containing `(status, createdAt)` invalidate PostgreSQL Heap-Only Tuple (HOT) updates on every state change, dirtying buffer pools and causing transaction lock contention.
   * **Action:** Consolidate redundant indexes and isolate hot status updates to a dedicated HOT-compatible table path.

2. **Sequential Table Scan on `branches` Filtering by Status (API / Pharmacy Search)**
   * **Metric:** Accumulated total database execution time **15,163.48 ms** across 48 calls (mean **315.91 ms**).
   * **Root Cause:** An index on `branches(branchStatus)` was dropped in migration `20260516055444`, forcing a sequential table scan across all branch records on every pharmacy directory lookup and admin approval check.
   * **Action:** Restore `CREATE INDEX "branches_branchStatus_idx" ON "branches"("branchStatus")`.

3. **Uncached User Identity DB Lookups in `JwtAuthGuard` (Hot Path Hammering)**
   * **Metric:** **9,722 queries** recorded in one observation cycle, consuming **5,674.80 ms** of database connection time.
   * **Root Cause:** `JwtStrategy.validate` queries `prisma.user.findUnique` on every incoming authenticated HTTP request, retrieving full user records (including password hashes and refresh tokens) across the remote Supabase connection pooler.
   * **Action:** Implement an in-process LRU cache (TTL 60s) or trust verified cryptographic JWT claims for identity and role validation.

---

## Infrastructure Decisions & Management Pre-requisites

Measurement during Weeks 2–4 proved that synthetic benchmarks and production latencies are frequently corrupted by platform infrastructure instability:

* **Ask 1: Dedicated Staging Database:**  
  Currently, developer testing and CI smoke testing share or collide on remote Supabase configurations. Performance profiling requires an isolated staging database running PostgreSQL 15 with identical schema and realistic anonymized seed volume.
* **Ask 2: Always-On Backend (Eliminate Dyno Sleep & Cold Starts):**  
  The current backend hosting platform idles idle worker instances. A cold start introduces a 4,500ms – 7,000ms latency spike before NestJS and Prisma connect. Every baseline latency number published here assumes a **warm instance**. Leadership sign-off is required to provision always-on, zero-sleep instances before Week 6 profiling begins.

---

*Baseline Pack v1 published and signed off for Week 5.*

