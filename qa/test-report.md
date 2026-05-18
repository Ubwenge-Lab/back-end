# API Endpoint Test Report

**Branch:** qa/testing  
**Date:** 2026-05-06  
**Base URL:** `http://localhost:4000/api`  
**Tester:** terancebana  

---

## Test Credentials

| Role | Email | Password |
|------|-------|----------|
| Patient | testpatient@evuze.com | Test@1234 |
| Pharmacy | — | — |
| Branch Manager | — | — |
| Super Admin | — | — |

## Tokens (Patient)

```
accessToken: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJjYjRmYTc2NC04NDU0LTQ3ZDYtYTI4ZC0yN2U0ZjA0YjI3NWIiLCJlbWFpbCI6InRlc3RwYXRpZW50QGV2dXplLmNvbSIsInJvbGUiOiJQQVRJRU5UIiwiaWF0IjoxNzc4MDkyMTU3LCJleHAiOjE3NzgwOTMwNTd9.SfDe51Ydsoq6JXAzW9VJPpShKy5s5i6g-IOOYUD-Eic

refreshToken: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJjYjRmYTc2NC04NDU0LTQ3ZDYtYTI4ZC0yN2U0ZjA0YjI3NWIiLCJlbWFpbCI6InRlc3RwYXRpZW50QGV2dXplLmNvbSIsInJvbGUiOiJQQVRJRU5UIiwiaWF0IjoxNzc4MDkyMTU3LCJleHAiOjE3Nzg2OTY5NTd9.PY1Id3lS9acmbi7uTZO9IlbgXEJRM3b2UmO6gWQ7F1g
```

---

## Module 1: Auth

| # | Method | Endpoint | Status | Notes |
|---|--------|----------|--------|-------|
| 1 | POST | `/auth/register/patient` | ✅ PASS | Returns verificationCode in dev mode (intentional) |
| 2 | POST | `/auth/verify-email` | ✅ PASS | |
| 3 | POST | `/auth/login` | ✅ PASS | Returns accessToken + refreshToken |
| 4 | POST | `/auth/register/pharmacy` | — | |
| 5 | POST | `/auth/resend-verification` | — | |
| 6 | POST | `/auth/forgot-password` | — | |
| 7 | POST | `/auth/reset-password` | — | |
| 8 | PUT | `/auth/change-password` | — | Requires auth |
| 9 | POST | `/auth/refresh` | — | Requires refreshToken |
| 10 | POST | `/auth/logout` | — | Requires auth |
| 11 | PUT | `/auth/branch/change-password` | — | Requires auth (branch manager) |
| 12 | PUT | `/auth/branch/upload-license` | — | Requires auth (branch manager) |

## Module 2: Patients

| # | Method | Endpoint | Status | Notes |
|---|--------|----------|--------|-------|
| 13 | GET | `/patients/profile` | — | Requires auth (patient) |
| 14 | PUT | `/patients/profile` | — | Requires auth (patient) |
| 15 | GET | `/patients/orders` | — | Requires auth (patient) |

## Module 3: Pharmacies

| # | Method | Endpoint | Status | Notes |
|---|--------|----------|--------|-------|
| 16 | GET | `/pharmacies/nearby` | — | |
| 17 | GET | `/pharmacies` | — | |
| 18 | GET | `/pharmacies/dashboard/stats` | — | Requires auth (pharmacy owner) |
| 19 | GET | `/pharmacies/dashboard/branch-stats` | — | Requires auth |
| 20 | GET | `/pharmacies/dashboard/analytics` | — | Requires auth |
| 21 | GET | `/pharmacies/dashboard/daily-revenue` | — | Requires auth |
| 22 | GET | `/pharmacies/dashboard/weekly-revenue` | — | Requires auth |
| 23 | GET | `/pharmacies/dashboard/patients` | — | Requires auth |
| 24 | GET | `/pharmacies/profile/me` | — | Requires auth (pharmacy owner) |
| 25 | PUT | `/pharmacies/profile/me` | — | Requires auth (pharmacy owner) |
| 26 | PATCH | `/pharmacies/profile/resubmit` | — | Requires auth |
| 27 | GET | `/pharmacies/stats` | — | Requires auth |
| 28 | GET | `/pharmacies/analytics` | — | Requires auth |
| 29 | GET | `/pharmacies/me` | — | Requires auth |
| 30 | PATCH | `/pharmacies/me` | — | Requires auth |
| 31 | GET | `/pharmacies/admin/pending` | — | Requires auth (super admin) |
| 32 | GET | `/pharmacies/admin/all` | — | Requires auth (super admin) |
| 33 | GET | `/pharmacies/locations` | — | |
| 34 | POST | `/pharmacies/admin/:id/approve` | — | Requires auth (super admin) |
| 35 | GET | `/pharmacies/:id` | — | |

## Module 4: Branches

| # | Method | Endpoint | Status | Notes |
|---|--------|----------|--------|-------|
| 36 | POST | `/branches/create` | — | Requires auth (pharmacy owner) |
| 37 | POST | `/branches/:id/send-credentials` | — | Requires auth |
| 38 | POST | `/branches/:id/resend` | — | Requires auth |
| 39 | GET | `/branches/my-branches` | — | Requires auth (pharmacy owner) |
| 40 | GET | `/branches/pharmacy-branches` | — | Requires auth |
| 41 | GET | `/branches/my-branch-details` | — | Requires auth (branch manager) |
| 42 | GET | `/branches/:id` | — | |
| 43 | DELETE | `/branches/:id` | — | Requires auth (pharmacy owner) |

## Module 5: Medications

| # | Method | Endpoint | Status | Notes |
|---|--------|----------|--------|-------|
| 44 | GET | `/medications/search` | — | |
| 45 | GET | `/medications/registry/search` | — | |
| 46 | GET | `/medications/pharmacy/low-stock` | — | Requires auth |
| 47 | GET | `/medications/pharmacy/out-of-stock` | — | Requires auth |
| 48 | GET | `/medications/pharmacy/my-medications` | — | Requires auth |
| 49 | GET | `/medications/:id` | — | |
| 50 | POST | `/medications` | — | Requires auth |
| 51 | PUT | `/medications/:id` | — | Requires auth |
| 52 | DELETE | `/medications/:id` | — | Requires auth |

## Module 6: Orders

| # | Method | Endpoint | Status | Notes |
|---|--------|----------|--------|-------|
| 53 | GET | `/orders/my-orders` | — | Requires auth (patient) |
| 54 | GET | `/orders/pharmacy-orders` | — | Requires auth (pharmacy) |
| 55 | GET | `/orders/:id` | — | Requires auth |
| 56 | POST | `/orders` | — | Requires auth (patient) |
| 57 | PATCH | `/orders/:id/status` | — | Requires auth |
| 58 | PATCH | `/orders/:id/cancel` | — | Requires auth |

## Module 7: Prescriptions

| # | Method | Endpoint | Status | Notes |
|---|--------|----------|--------|-------|
| 59 | POST | `/prescriptions` | — | Requires auth |
| 60 | GET | `/prescriptions/my-prescriptions` | — | Requires auth (patient) |
| 61 | GET | `/prescriptions/branch` | — | Requires auth (branch) |
| 62 | GET | `/prescriptions/:id` | — | Requires auth |
| 63 | PUT | `/prescriptions/:id/status` | — | Requires auth |

## Module 8: Staff

| # | Method | Endpoint | Status | Notes |
|---|--------|----------|--------|-------|
| 64 | POST | `/staff` | — | Requires auth (branch manager) |
| 65 | GET | `/staff` | — | Requires auth |
| 66 | GET | `/staff/:id` | — | Requires auth |
| 67 | PUT | `/staff/:id` | — | Requires auth |
| 68 | DELETE | `/staff/:id` | — | Requires auth |
| 69 | POST | `/staff/:id/resend-credentials` | — | Requires auth |
| 70 | GET | `/staff/profile/me` | — | Requires auth (staff) |
| 71 | PUT | `/staff/profile/change-password` | — | Requires auth (staff) |

## Module 9: Payments

| # | Method | Endpoint | Status | Notes |
|---|--------|----------|--------|-------|
| 72 | POST | `/payments/initiate` | — | Requires auth |
| 73 | POST | `/payments/verify` | — | Requires auth |
| 74 | POST | `/payments/validate-otp` | — | Requires auth |
| 75 | GET | `/payments/verify/:orderId` | — | Requires auth |
| 76 | GET | `/payments/cashier/recent` | — | Requires auth |
| 77 | POST | `/payments/webhook/mtn` | — | |
| 78 | GET | `/payments/:paymentId/receipt` | — | Requires auth |
| 79 | POST | `/payments/checkout` | — | Requires auth |
| 80 | POST | `/payments/record` | — | Requires auth |

## Module 10: Stock Transfers

| # | Method | Endpoint | Status | Notes |
|---|--------|----------|--------|-------|
| 81 | GET | `/stock-transfers/branch` | — | Requires auth |
| 82 | POST | `/stock-transfers` | — | Requires auth |
| 83 | PATCH | `/stock-transfers/:id/status` | — | Requires auth |

## Module 11: Attendance

| # | Method | Endpoint | Status | Notes |
|---|--------|----------|--------|-------|
| 84 | POST | `/attendance/clock-in` | — | Requires auth (staff) |
| 85 | POST | `/attendance/clock-out` | — | Requires auth (staff) |
| 86 | GET | `/attendance/my-attendance` | — | Requires auth (staff) |
| 87 | GET | `/attendance/my-current` | — | Requires auth (staff) |
| 88 | GET | `/attendance/pending-clock-ins` | — | Requires auth (manager) |
| 89 | GET | `/attendance/pending-clock-outs` | — | Requires auth (manager) |
| 90 | PUT | `/attendance/:id/approve-clock-in` | — | Requires auth (manager) |
| 91 | PUT | `/attendance/:id/reject-clock-in` | — | Requires auth (manager) |
| 92 | PUT | `/attendance/:id/approve-clock-out` | — | Requires auth (manager) |
| 93 | PUT | `/attendance/:id/reject-clock-out` | — | Requires auth (manager) |
| 94 | GET | `/attendance/branch` | — | Requires auth (manager) |
| 95 | GET | `/attendance/summary` | — | Requires auth |

## Module 12: Notifications

| # | Method | Endpoint | Status | Notes |
|---|--------|----------|--------|-------|
| 96 | GET | `/notifications` | — | Requires auth |
| 97 | PUT | `/notifications/:id/read` | — | Requires auth |
| 98 | PUT | `/notifications/read-all` | — | Requires auth |

## Module 13: Super Admin

| # | Method | Endpoint | Status | Notes |
|---|--------|----------|--------|-------|
| 99 | GET | `/super-admin/analytics` | — | Requires auth (super admin) |
| 100 | GET | `/super-admin/pharmacies/pending` | — | Requires auth (super admin) |
| 101 | GET | `/super-admin/pharmacies` | — | Requires auth (super admin) |
| 102 | GET | `/super-admin/pharmacies/unverified-locations` | — | Requires auth (super admin) |
| 103 | GET | `/super-admin/pharmacies/:id` | — | Requires auth (super admin) |
| 104 | GET | `/super-admin/pharmacies/:id/documents/rdb-certificate` | — | Requires auth (super admin) |
| 105 | GET | `/super-admin/pharmacies/:id/documents/pharmacy-license` | — | Requires auth (super admin) |
| 106 | PATCH | `/super-admin/pharmacies/:id/approve` | — | Requires auth (super admin) |
| 107 | PUT | `/super-admin/pharmacies/:id/approve` | — | Requires auth (super admin) |
| 108 | PATCH | `/super-admin/pharmacies/:id/reject` | — | Requires auth (super admin) |
| 109 | PUT | `/super-admin/pharmacies/:id/reject` | — | Requires auth (super admin) |
| 110 | GET | `/super-admin/patients` | — | Requires auth (super admin) |
| 111 | GET | `/super-admin/orders/recent` | — | Requires auth (super admin) |
| 112 | GET | `/super-admin/revenue` | — | Requires auth (super admin) |
| 113 | PATCH | `/super-admin/pharmacies/:id/verify-location` | — | Requires auth (super admin) |
| 114 | GET | `/super-admin/branches/unverified-locations` | — | Requires auth (super admin) |
| 115 | PATCH | `/super-admin/branches/:id/verify-location` | — | Requires auth (super admin) |
| 116 | GET | `/super-admin/branches/pending` | — | Requires auth (super admin) |
| 117 | PATCH | `/super-admin/branches/:id/approve` | — | Requires auth (super admin) |
| 118 | PATCH | `/super-admin/branches/:id/reject` | — | Requires auth (super admin) |

## Module 14: Triangulation

| # | Method | Endpoint | Status | Notes |
|---|--------|----------|--------|-------|
| 119 | GET | `/triangulation/nearby` | — | |
| 120 | GET | `/triangulation/global` | — | |
| 121 | GET | `/triangulation/map-data` | — | |
| 122 | GET | `/triangulation/owner` | — | Requires auth (pharmacy owner) |
| 123 | GET | `/triangulation/manager` | — | Requires auth (branch manager) |
| 124 | GET | `/triangulation/competitors` | — | Requires auth |

## Module 15: Location

| # | Method | Endpoint | Status | Notes |
|---|--------|----------|--------|-------|
| 125 | GET | `/location/verify` | — | |

## Module 16: Upload

| # | Method | Endpoint | Status | Notes |
|---|--------|----------|--------|-------|
| 126 | POST | `/upload/prescription` | — | Requires auth |
| 127 | POST | `/upload/license` | — | Requires auth |
| 128 | POST | `/upload/medication-image` | — | Requires auth |
| 129 | DELETE | `/upload/file` | — | Requires auth |

## Module 17: Insurance

| # | Method | Endpoint | Status | Notes |
|---|--------|----------|--------|-------|
| 130 | GET | `/insurance/providers` | — | |
| 131 | POST | `/insurance/verify` | — | Requires auth |

---

## Summary

| Total | Passed | Failed | Skipped |
|-------|--------|--------|---------|
| 131 | 3 | 0 | 128 |

---

## Issues Found

| # | Endpoint | Issue | Severity | Fixed |
|---|----------|-------|----------|-------|
| 1 | Server startup | Prisma client out of sync with schema | High | ✅ Yes — ran `prisma generate` |
| 2 | Server startup | DB max connections reached (session mode pooler) | High | ✅ Yes — switched to port 6543 + `?pgbouncer=true&connection_limit=1` |
