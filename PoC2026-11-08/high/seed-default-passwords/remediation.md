# Remediation — Default Seed Passwords in Production

## Priority: P1

### 1. Stop shipping demo accounts to production
1. Never run `seed.ts` against the production DB. Add a guard:
   ```typescript
   if (process.env.NODE_ENV === 'production' && !process.env.ALLOW_PROD_SEED) {
     throw new Error('Refusing to seed demo data in production');
   }
   ```
2. Clean the existing demo accounts from the production DB (or force them
   through a first-login password reset).

### 2. Force password change on first login
1. Reuse the existing `requiresPasswordChange` flag: mark all demo accounts
   so the next login *requires* a new password before any other endpoint
   works.
2. Alternatively rotate their hashes to random values and send reset links.

### 3. Enforce a real password policy
1. Add complexity/length requirements in the auth DTOs (`LoginDto`,
   `RegisterPatientDto`, …) and a minimum length (≥ 12).
2. Disallow known-default passwords via a blocklist.

### 4. Operational hygiene
1. Rotate passwords of any seed account that a staff member actually uses.
2. Add an alert if a login uses the known default password.

### Acceptance criteria
- [ ] No `Test@1234` login succeeds in production
- [ ] Demo accounts removed or force-rotated
- [ ] Production refuses to run the demo seed
