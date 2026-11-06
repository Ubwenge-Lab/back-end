# Surface Impact Ranking (2026-Q4)
**Lead Researcher:** Rosalba (Product & Client Telemetry)  
**Engineering Synthesis:** Adeline Tuyizere  
**Target Window:** 2026-Q4 Baseline Pack v1  
**Sign-off:** Chief Technology Officer (CTO) & Head of Product

---

## 1. Executive Summary: The Top 3 Money-Losing Surfaces

Slowness across the platform affects different workflows differently. A delay in loading a monthly audit report causes minor internal annoyance, whereas slowness at a pharmacy cash register causes **immediate revenue loss, client abandonment, and inventory divergence**.

The audit identifies the **Top 3 surfaces where platform latency directly costs the business money**:

1. **POS Counter Sales & Checkout (Surface #1)**
   * **Why Slowness Costs Money:** In retail partner pharmacies across Kigali and Kampala, checkout lines stall during peak afternoon hours. When the POS checkout button takes **2.5 to 4.2 seconds** (holding row locks on `orders` and iterating over cart line items), cashiers face gateway timeouts or re-tap "Pay", creating duplicate pending transactions. Frustrated walk-in customers walk across the street to competing pharmacies rather than waiting for counter processing.
   * **Direct Business Impact:** Estimated 4–6% cart abandonment at partner counters during high-volume hours.

2. **Prescription Parsing, Upload & Cart Fulfillment (Surface #2)**
   * **Why Slowness Costs Money:** When a patient or hospital uploads a multi-item prescription, the backend performs sequential inserts per item and sequential cart lookups. Total round-trip turnaround exceeds **3.8 seconds**. Delays in converting a valid prescription into confirmed dispensary line items lead to abandoned order conversions and direct revenue leakage to external fulfillment channels.
   * **Direct Business Impact:** Up to 8% drop-off between prescription ingestion and order confirmation.

3. **Medication Catalog & Pharmacy Stock Search (Surface #3)**
   * **Why Slowness Costs Money:** Search is the primary discovery funnel on both mobile and pharmacy web portals. With full table sequential scans on `medication_registry` (`ILIKE '%term%'`) and over-fetching of unnecessary branch columns, typing into search feels laggy (TTFB > **600ms** on mobile data). When search results fail to load in <1 second, prospective buyers assume the item is out of stock and exit the platform.
   * **Direct Business Impact:** Directly depresses checkout search conversion rates across the mobile consumer app.

---

## 2. Ten Core Platform Surfaces Ranked by Client Use & Commercial Value

The table below ranks the ten platform surfaces. For every surface, the basis of classification is explicitly labeled as either **[EVIDENCE]** (telemetry, DB queries, logs, Sentry) or **[JUDGEMENT]** (commercial strategy, stakeholder feedback, clinical risk).

| Rank | Surface Name | Primary User Persona | Monthly Active Usage / Daily Events | Commercial Importance (1–5) | Top Latency Bottleneck | Basis of Assessment |
|---|---|---|---|---|---|---|
| **#1** | **POS Sales Counter & Checkout** | Pharmacy Cashier & Dispenser | **~14,000 transactions / month** (Peak: 18 req/sec) | **5 (Critical)** | `orders` status update write amplification (**516ms** mean); N+1 cart deduction loops. | **[EVIDENCE]**<br>Recorded in `pg_stat_statements` (14,025 order queries); cashier transaction logs; partner complaints. |
| **#2** | **Prescription Processing & Fulfillment** | Patients, Doctors, Pharmacists | **~8,500 prescriptions / month** | **5 (Critical)** | Sequential `create` loops on prescription meds; unbatched cart item upserts. | **[EVIDENCE]**<br>Application traces show **680ms – 1,200ms** backend parsing duration; upload funnel drop-off analytics. |
| **#3** | **Medication Catalog & Live Stock Search** | Retail Patients & Mobile Shoppers | **~110,000 queries / month** (Hot search path) | **5 (Critical)** | Substring sequential scans (`ILIKE`); over-fetching 11 nested relational fields. | **[EVIDENCE]**<br>Lighthouse mobile TTFB **610ms**; `pg_stat_statements` EXPLAIN plan showing 2,390 rows removed by filter per scan. |
| **#4** | **Inpatient Admission & Bed Allocation** | Hospital Nurses, Ward Clerks | **~3,200 admissions / month** | **4 (High)** | Interactive transaction locks during bed assignment; bed status drift. | **[JUDGEMENT]**<br>Clinical urgency: bed delays stall ER admissions; clinical SLA compliance is legally required. |
| **#5** | **Hospital Invoicing & Claims Reconciliation** | Hospital Billing Staff & Insurers | **~4,100 invoices / month** | **4 (High)** | Multi-table joins across admissions, procedures, and consumables without composite indexing. | **[EVIDENCE]**<br>Sentry reports invoice generation timeouts exceeding 8,000ms on complex multi-day stays. |
| **#6** | **Inter-Branch Stock Transfers** | Branch Managers & Warehouse Logistics | **~1,800 transfer requests / month** | **3 (Medium)** | Sequential double-loops inside transaction when validating stock and updating shipping status. | **[EVIDENCE]**<br>Code audit reveals $O(2N)$ queries per dispatch; developer raised transaction timeout to 20s. |
| **#7** | **Pharmacy Onboarding & Verification** | Super Admins & Pharmacy Owners | **~120 registrations / month** | **3 (Medium)** | Full sequential scan on `branches(branchStatus)` (**315ms** mean, 15,163ms total) on directory views. | **[EVIDENCE]**<br>`pg_stat_statements` capture #2 total latency query; dropped index in migration history. |
| **#8** | **Patient Aggregated Medical History** | Attending Physicians & Specialists | **~6,000 profile views / month** | **3 (Medium)** | 6-query sequential waterfall executing 3 full entity queries and 3 `count(*)` calls. | **[EVIDENCE]**<br>Traced in `PatientsService.getAggregatedMedicalHistory` (lines 362–386). |
| **#9** | **Nurse Triage & Daily Vitals Recording** | Ward Nurses & Triage Staff | **~9,500 recordings / month** | **2 (Low)** | Unindexed lookups on patient active admissions; unbatched vitals time-series inserts. | **[JUDGEMENT]**<br>High daily frequency, but low financial impact; nurses can tolerate 1–2 second save times without dropping care. |
| **#10**| **System Admin Settings & Platform Metrics** | System Administrators & Executives | **~450 sessions / month** | **1 (Internal)** | Uncached aggregation queries calculating total revenue, active users, and system audit counts. | **[JUDGEMENT]**<br>Purely internal operations; zero client-facing revenue impact. Acceptable to defer to Q1 2027. |

---

## 3. Evidence vs. Judgement Breakdown

To ensure accountability and prevent subjective bias from directing engineering resources:

* **Evidence-Based Rows (7 of 10):**
  * *Surfaces #1, #2, #3, #5, #6, #7, #8* are grounded in direct telemetry: `pg_stat_statements` execution counts, EXPLAIN execution plans with buffer hit counts, Sentry exception frequencies, and network request traces.
* **Judgement-Based Rows (3 of 10):**
  * *Surfaces #4, #9, #10* are informed by clinical operational risk, patient health safety mandates, and executive workflow priorities that cannot be quantified solely through HTTP request counts.

---

*Surface impact ranking established to govern Week 6–9 resource allocation.*

