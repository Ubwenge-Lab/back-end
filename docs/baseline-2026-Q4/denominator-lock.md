# Locking the Q4 Denominator & Execution Arithmetic
**Target Quarter:** 2026-Q4 (Performance Optimization & Platform Hardening)  
**Publication Gate:** Baseline Pack v1 (Week 5, Sun 01 Nov 2026)  
**Sign-off:** CTO, Head of Product, and Engineering Lead

---

## 1. Executive Summary

A critical failure mode of quarterly engineering initiatives is an ambiguous or moving target. Without a locked denominator:
* "Performance improvements" become subjective impressions rather than verified numbers.
* Teams inflate completion rates by counting trivial tweaks while skipping difficult architectural bottlenecks.
* Post-hoc feature requests creep in as "defects."

To prevent this, engineering has reconciled the **32 preliminary candidate items** proposed in the initial Q4 planning doc against the physical evidence uncovered during the Weeks 2–4 platform audit.

* **Preliminary Candidate Pool:** 32 items
* **Dropped (Not Measurable / Non-Actionable):** 6 items
* **Split (Single Items Containing Multiple Distinct Engineering Fixes):** +3 items
* **Final Locked Denominator:** **29 Verified Items**
* **Quarterly Target 90:** **26 completed and verified items** (89.65% $\approx$ 90%)
* **Weekly Execution Velocity:** **~6.0% per week** (~1.75 items/week or ~3.5 items per 2-week cycle across Weeks 6 to 9)

---

## 2. Denominator Reconciliation Table (32 Candidates &rarr; 29 Locked)

| Preliminary Item | Category | Audit Verification Finding | Action Taken | Resulting Item Count | Justification / Breakdown |
|---|---|---|---|---|---|
| **#1–#5: Database Indexing & Slow Queries** | Database | Confirmed via `pg_stat_statements` (Orders status, Branches status, Notifications, Manager FK, Stock transfer FK). | **Retained as-is** | **5 items** | All 5 have documented EXPLAIN plans, baseline execution times, and target queries. |
| **#6: "Improve POS Cart Performance"** | POS / Cart | Code audit revealed 3 distinct architectural bugs: interactive loop, transaction lock timeout, and missing inventory batching. | **SPLIT into 3 distinct tasks** | **+2 items** (Now items #6A, #6B, #6C) | • **#6A:** Batch cart line-item validation outside tx.<br>• **#6B:** Replace interactive transaction loops with atomic decrement.<br>• **#6C:** Optimize POS order creation relation tree payload. |
| **#7–#11: Prescription Processing Optimization** | Prescriptions | Verified: N+1 item loop, cart upsert loop, over-fetching on review. | **Retained as-is** | **5 items** | Each item corresponds to a specific service method and benchmarked latency reduction. |
| **#12: "Make Search Feel Snappier"** | Search / UX | Initial item had no target latency or telemetry metric. | **DROPPED** | **-1 item** | Replaced by measurable backend trigram index and frontend debounce (Items #13 & #14). Subjective "feel" cannot be verified. |
| **#13–#16: Medication Search & Autocomplete** | Catalog Search | Verified: Sequential scan on ILIKE, over-fetching 11 fields, missing debounce. | **Retained as-is** | **4 items** | Trigram extension, field selection pruning, client caching. |
| **#17: "Improve Frontend UX Aesthetics"** | Frontend | Unclear scope; no baseline Lighthouse or Web Vitals threshold specified. | **DROPPED** | **-1 item** | Non-measurable design request; moved to Product backlog for Q1 2027. |
| **#18: "General Code Cleanup & Refactoring"** | Code Quality | Speculative cleanup with no defect trace or security advisory link. | **DROPPED** | **-1 item** | Violates Q4 baseline rule ("No speculative tasks without a number or pipeline"). |
| **#19–#22: Stock Transfers & Warehouse Dispatch** | Inventory | Verified: Double loop inside interactive tx, status transition race condition. | **Retained as-is** | **4 items** | Concrete state machine and query batching implementations. |
| **#23: "Explore Microservice Extraction for Auth"** | Architecture | Premature architectural rewrite; excessive cost for current stage. | **DROPPED** | **-1 item** | Violates ROI threshold. Uncached `JwtStrategy` lookup resolved via LRU cache in 1.5 days. |
| **#24: "Optimize Mobile App Startup Time"** | Mobile | Not instrumented in mobile analytics; cannot establish reproducible baseline without staging infrastructure. | **DROPPED** | **-1 item** | Blocked on Staging environment and mobile telemetry instrumentation. |
| **#25: "Upgrade All Third-Party NPM Packages"** | Security | Unscoped blanket upgrade; risks regressions. | **DROPPED** | **-1 item** | Replaced by Part B CI automated gate (Dependabot + `npm audit --audit-level=high`). |
| **#26: "Fix Stock Transfer Concurrency & State Machine"** | Logistics | Audit showed stock moves at SHIPPED, but cancellation logic was missing. | **SPLIT into 2 distinct tasks** | **+1 item** (Now #26A, #26B) | • **#26A:** Stock transfer state machine transition locking.<br>• **#26B:** Batch medication inventory release on CANCELLED. |
| **#27–#32: Inpatient Bed & Hospital Billing Pipelines** | Inpatient / Billing | Verified: Bed status concurrency, invoice waterfall aggregation, consumable BOM deduction. | **Retained as-is** | **6 items** | High clinical urgency and measurable latency/error reductions. |

---

## 3. Reconciliation Arithmetic

$$\begin{aligned}
\text{Initial Candidate Pool} &= 32 \\
\text{Less: Dropped Items (Non-measurable / Unscoped)} &= -6 \\
\text{Plus: Split Multi-Part Tasks} &= +3 \\
\hline
\mathbf{\text{Final Locked Denominator}} &\mathbf{= 29 \text{ Items}}
\end{aligned}$$

---

## 4. Quarterly Target 90 Execution Arithmetic

* **Locked Denominator ($D$):** $29$
* **Target Completion Percentage:** $90\%$
* **Target Completed Items ($T$):**
  $$T = \lceil 29 \times 0.90 \rceil = \mathbf{26 \text{ Items}}$$
* **Allowable Contingency Deficit:** $29 - 26 = \mathbf{3 \text{ Items}}$ (Items that may be safely deferred or blocked by external dependencies without jeopardizing the quarterly green gate).

### Weekly Velocity Schedule (Weeks 6 through 9)

With 4 execution weeks remaining in the core sprint cycle (Weeks 6, 7, 8, 9), the team must sustain an average completion velocity of **~6.5 items per week across the team** (or **~6.0% of total denominator per week per track**):

$$\text{Weekly Velocity} = \frac{26 \text{ Target Items}}{4 \text{ Sprints}} = 6.5 \text{ verified items / week across engineering}$$

| Week | Sprint Focus | Target Cumulative Items Completed | Target Cumulative % | Gate Verification Requirement |
|---|---|---|---|---|
| **Week 5** | Baseline Pack v1 & Backend CI Fast Gate | 0 items (Baseline publication) | 0.0% | CTO Sign-off on Baseline Pack v1; CI Gate active. |
| **Week 6** | P0 Quick Wins (DB HOT updates, Branches index, JWT cache, Notifications index) | 7 items | 24.1% | Latency reductions verified via `pg_stat_statements` in staging. |
| **Week 7** | P1 Core Workflows (POS Cart batching, Rx parsing `createMany`, Trigram search) | 14 items | 48.3% | Counter checkout P95 drops below 500ms; Rx parsing below 200ms. |
| **Week 8** | P2 Data Flow & Logistics (Stock transfer batching, Bed lifecycle, Over-fetching pruning) | 21 items | 72.4% | Mobile medication search payload drops by >50%; 0 deadlocks on transfers. |
| **Week 9** | P3 Polish, Invoicing, Aggregations & Target 90 Verification | **26 items** | **89.7% ($\approx$ 90%)** | Full regression verification; quarterly performance report published. |

---

*Denominator locked at 29 items. Any proposed additions require a formal 1-in-1-out swap approved by the CTO.*

