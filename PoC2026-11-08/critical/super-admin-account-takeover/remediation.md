# Remediation — Super Admin Account Takeover

## Priority: P0

### 1. Rotate the super admin password NOW
1. Change the password via the app (or reset the bcrypt hash with a fresh
   random password).
2. Remove `SUPER_ADMIN_PASSWORD` from `.env.example` (and purge history —
   see the database pack). It must never live in a committed file.
3. Remove the code fallback `SuperAdminPower@2025`
   (`src/auth/auth.service.ts:83`) and the seed default `Test@1234`
   (`src/prisma/seed.ts`). Fail closed if the env var is missing.

### 2. Force credential rotation for ALL seeded accounts
1. The seed created many accounts (patients, pharmacy owners, cashiers,
   managers, doctors, hospital staff) with the same known password.
   - Mark them `requiresPasswordChange = true` on next login, or
   - Re-hash them with random passwords and revoke existing refresh tokens.
2. In production, never run the demo seed. Introduce a flag
   (`SEED_DEMO_DATA=false`) that skips demo accounts entirely.

### 3. Strengthen super admin login
1. Add MFA / TOTP for `SUPER_ADMIN` role (or a hardware-key flow).
2. Alert (email + log) on super-admin login from a new device/IP.
3. Require a second secret (e.g. the existing `SUPER_ADMIN_SECRET_KEY`
   concept) that is stored ONLY in the secrets manager.

### 4. Reduce blast radius of admin tokens
1. Separate the admin API onto a distinct service/namespace with its own
   stricter guards, or require elevated re-authentication for sensitive
   actions (approve pharmacy, refund, export PHI).
2. Shorten admin token TTL and revoke on password change.

### Acceptance criteria
- [ ] Old `SuperAdmin@2025` no longer logs in
- [ ] No default/known passwords exist in the production DB
- [ ] `.env.example` contains no real credentials
- [ ] Super admin login requires MFA
- [ ] Demo seed does not run in production
