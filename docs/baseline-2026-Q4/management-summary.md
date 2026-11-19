# Weekly Management Review Summary (Week 5)
**Prepared By:** Adeline Tuyizere (Backend Lead)  
**Reporting Date:** Week 5 (Mon 26 Oct – Sun 01 Nov 2026)  
**Deliverable Link:** `docs/baseline-2026-Q4/README.md`  
**Status:** **Green / On-Track for Sunday 01 Nov Gate**

---

## 1. Executive Summary & Headline Progress

Week 5 marked the planned transition from platform-wide performance auditing to baseline consolidation and deployment pipeline hardening. In accordance with Q4 guidelines, zero speculative features were built.

* **Baseline Pack v1 Published:** All seven core audit domains (Frontend, API, Database, Bundle Sizes, Sentry Errors, UX Defects, Impact Ranking) have been assembled into a single indexed artifact repository under `docs/baseline-2026-Q4/`.
* **Denominator Officially Locked:** Preliminary candidate items (32) were reconciled against physical evidence, yielding **29 verified optimization items**. Achieving **Target 90 (26 verified items)** requires an execution velocity of **~6% per week** across Weeks 6–9.
* **Top 3 Commercial Bottlenecks Identified:**
  1. `orders` status update write amplification on checkout (mean **516.98ms**, max **2,748ms**).
  2. Missing B-Tree index on `branches(branchStatus)` causing **15,163ms** cumulative sequential scans.
  3. Uncached user lookups in `JwtAuthGuard` executing **9,722 DB queries** across authenticated APIs.
* **Backend CI/CD Fast Gate (Part B):** Implemented a lightweight automated gate (`.github/workflows/ci.yml`) enforcing ESLint, NestJS compilation, Prisma schema validation, Jest unit tests with coverage ratcheting, and high-severity vulnerability blocking via `npm audit` and Dependabot.

---

## 2. Management Workbook Reconciliation

The official management tracking workbook has been reconciled with the following entries:

| Sprint Row | Scheduled Deliverable | Status | Planned Count | Actual Count | Notes / Reference Location |
|---|---|---|---|---|---|
| **Week 2** | Platform Profiling & Measurement Framework Setup | **Completed** | 6 | **6** | Diagnostic telemetry and profiling harness deployed; deliverable path: `docs/baseline-2026-Q4/`. |
| **Week 3** | Database Baseline Audit (Slow Queries, N+1s, Indexes) | **Completed** | 6 | **6** | Completed by Adeline: `pg_stat_statements` capture, EXPLAIN plans, candidate index list in `docs/baseline-2026-Q4/database-baseline.md`. |
| **Week 5** | Baseline Pack v1 Publication & Backend CI/CD Pipeline | **In-Review** | 6 | **6** | Baseline Pack v1 assembled; CI fast gate and Dependabot deployed in `.github/`. |

---

## 3. Leadership Decisions & Support Needed (Carried Forward)

> [!WARNING]
> **Every performance number published in Baseline Pack v1 assumes a warm instance and predictable connection routing. Synthetic measurements and production profiling will be invalidated without leadership action on these two infrastructure blockers:**

1. **Dedicated Staging Database Environment:**
   * **Problem:** Currently, developer feature branches and automated CI runs contend for shared Supabase pooled instances, leading to transaction lock starvation and noisy neighbor artifacts.
   * **Ask:** Provision an isolated staging PostgreSQL 15 database instance configured with identical schema and production-scaled anonymized test fixtures.
   * **Owner:** VP of Engineering / DevOps Lead.

2. **Always-On Backend Hosting (Eliminate Cold Starts & Dyno Sleep):**
   * **Problem:** The current cloud hosting tier idles backend worker instances during low-traffic periods. Cold-start wakeups inject **4.5 to 7.0 seconds of latency**, which corrupts automated performance alarms and delivers stale code deploys to client browsers.
   * **Ask:** Authorize an upgrade to persistent, zero-sleep instances that do not scale down to zero.
   * **Owner:** Chief Technology Officer (CTO) & VP of Finance.

---

## 4. Key Milestones for Weeks 6 & 7

* **Week 6 (P0 Quick Wins):** Execute HOT update restoration on `orders`, apply candidate indexes on `branches` and `notifications`, and deploy in-memory TTL caching for `JwtAuthGuard`. Target: **7 items verified**.
* **Week 7 (P1 Hot Paths):** Implement query batching across POS cart checkout transactions and prescription parsing. Target: **14 items cumulative verified**.

---

*Baseline Pack v1 submitted for executive sign-off.*

