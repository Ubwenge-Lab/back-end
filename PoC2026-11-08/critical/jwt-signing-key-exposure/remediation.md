# Remediation — JWT Signing Key Exposure

## Priority: P0 (rotation) + P1 (hardening)

### 1. Rotate the JWT secrets NOW and never commit them again
1. Generate two new secrets (≥ 64 random hex bytes each):
   ```bash
   openssl rand -hex 64   # access
   openssl rand -hex 64   # refresh
   ```
2. Deploy with the new secrets via the secrets manager (Render env vars /
   vault). Old tokens become invalid immediately.
3. Remove `JWT_SECRET`/`JWT_REFRESH_SECRET` from `.env.example` and purge
   git history (see `database-credential-exposure` pack).

### 2. Stop reusing JWT_SECRET for other purposes
1. Prescription QR hashes currently key off `JWT_SECRET`
   (`prescriptions.service.ts:623-626`). Use a **dedicated secret**
   (`PRESCRIPTION_HMAC_SECRET`) and rotate it separately.
2. Remove the `'default-prescription-secret-key-2026'` fallback — fail closed
   when the env var is missing.

### 3. Harden the token validation
1. **Bind tokens to the user server-side**: the strategy should reject tokens
   whose `sub` does not match the DB record AND whose `iat` is older than the
   user's `updatedAt`/password-changed timestamp (token versioning).
2. Stop trusting client-supplied claims in the payload. `hospitalId` must be
   re-derived from the DB, never read from the token:
   ```typescript
   const hospitalId = await resolveHospitalId(user.id, user.role);
   return { sub: user.id, email: user.email, role: user.role, hospitalId };
   ```
3. Add a `tokenVersion` column; bump it on password change/logout-all.

### 4. Monitoring
- Alert on many 401s with structurally-valid but signature-invalid tokens
  (indicates forgery attempts against the new secret).

### Acceptance criteria
- [ ] New secrets deployed; forged tokens with the old secret → 401
- [ ] `git log -p` contains no JWT secrets
- [ ] Prescription HMAC uses its own secret
- [ ] Tokens are invalidated on password change
