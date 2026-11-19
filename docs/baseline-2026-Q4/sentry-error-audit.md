# Sentry Production Error Audit (2026-Q4)
**Measurement Window:** Week 4 (Mon 19 Oct – Fri 23 Oct 2026)  
**Target Projects:** `ubwenge-backend` (NestJS) & `ubwenge-frontend` (React/Next) on Sentry SaaS  
**Auditor:** Adeline Tuyizere

---

## 1. Error Rate Overview

* **Total Recorded HTTP Transactions:** 142,800
* **Total Unhandled Exceptions (5xx):** 3,284
* **Overall Unhandled Exception Rate:** **2.30%** (Industry target: < 0.2%)
* **Top Contributing Cause:** Database connection timeouts and concurrent transaction aborts.

---

## 2. Top Five Recurring Exceptions

| # | Sentry Issue Title | Service / Location | Occurrences (7 Days) | Impacted Users | Root Cause |
|---|---|---|---|---|---|
| **1** | `PrismaClientKnownRequestError: Timed out fetching a connection from the pool` | Database Pool / PgBouncer | **1,420** | **318** | Interactive transaction loops in `pos.service.ts` holding connection pool slots open beyond 10s. |
| **2** | `QueryFailedError: could not serialize access due to concurrent update` | Orders / Checkout | **684** | **142** | Concurrent checkout requests updating same inventory record without row lock sequencing. |
| **3** | `UnauthorizedException: Invalid or expired token` | Auth Guard | **490** | **210** | Refresh token race condition when multiple parallel calls trigger simultaneous refresh. |
| **4** | `PayloadTooLargeError: request entity too large` | Prescription Upload | **280** | **95** | High-resolution image uploads exceeding 5 MB limit without client-side compression. |
| **5** | `TypeError: Cannot read properties of null (reading 'branchId')` | POS Sales Service | **172** | **44** | Cashier session losing branch attachment when logging in from secondary workstation. |

---

## 3. Remediation Focus for Q4

* Resolving the connection pool timeouts (Issue #1) and serialization deadlocks (Issue #2) forms the backbone of Weeks 6 and 7 database optimization tasks.

