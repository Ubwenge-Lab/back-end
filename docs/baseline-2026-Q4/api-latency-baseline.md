# API Latency Baseline Audit (2026-Q4)
**Measurement Window:** Week 4 (Mon 12 Oct – Fri 16 Oct 2026)  
**Target Environment:** Production Backend (`api.ubwenge.com`, warm instances, Render)  
**Database:** PostgreSQL 15 on Supabase (`aws-1-eu-west-2.pooler.supabase.com:5432`)  
**Methodology:** 500 concurrent synthetic requests per endpoint during off-peak and peak hours via k6 load generator.

---

## 1. Latency Benchmarks by Endpoint

| Endpoint | HTTP Method | Surface / Flow | P50 (ms) | P95 (ms) | P99 (ms) | Target P95 (Q4 Goal) | Root Cause for High Latency |
|---|---|---|---|---|---|---|---|
| `/auth/login` | POST | Authentication | **180** | **420** | **780** | **< 200ms** | Bcrypt hash verification + unindexed user query. |
| `/pos/checkout` | POST | POS Sales Counter | **820** | **1,840** | **3,200** | **< 500ms** | Interactive transaction loops holding locks on remote DB. |
| `/orders/:id/status` | PATCH | Order State Machine | **320** | **940** | **2,740** | **< 150ms** | Write amplification on 5 composite indexes on `orders`. |
| `/medications/search` | GET | Catalog Autocomplete | **240** | **610** | **1,150** | **< 100ms** | Substring sequential scans (`ILIKE`) on `medication_registry`. |
| `/branches` | GET | Pharmacy Directory | **190** | **480** | **890** | **< 100ms** | Sequential scan on `branches` table filtering by status. |
| `/prescriptions/parse` | POST | Prescription Intake | **450** | **1,200** | **2,100** | **< 300ms** | Sequential `create` calls for each medication line item. |
| `/stock-transfers/:id/ship` | POST | Logistics Shipping | **390** | **1,150** | **2,450** | **< 250ms** | Double loops inside transaction updating transfer items. |
| `/patients/:id/medical-history` | GET | Patient Dashboard | **310** | **820** | **1,450** | **< 200ms** | 6-query waterfall fetching entities and count queries. |
| `/inpatient/admissions` | POST | Bed Assignment | **280** | **760** | **1,600** | **< 250ms** | Concurrency checks on bed availability without row locking. |
| `/notifications` | GET | Unread Bell Icon | **95** | **310** | **650** | **< 50ms** | Sequential scan on notifications missing composite user index. |

---

## 2. Cold-Start Overhead Distortion

* When backend instances sleep after 15 minutes of inactivity:
  * First HTTP request P95 spikes to **6,400 ms** (NestJS module boot + Prisma engine initialization).
  * Subsequent requests stabilize to the warm P50/P95 latencies reported above.
* **Pre-requisite:** Eliminating instance sleep is mandatory before Week 6 benchmarking.

