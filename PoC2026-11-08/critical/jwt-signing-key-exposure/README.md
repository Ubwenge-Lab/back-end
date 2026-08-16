# JWT Signing Key Exposure — CRITICAL (Static-Confirmed)

## Vulnerability Summary

The `JWT_SECRET` and `JWT_REFRESH_SECRET` used to sign access tokens are
committed to the public GitHub repo in `.env.example`. If these match the
production secrets (or are ever reused), an attacker can forge access tokens
for **any user ID** and achieve total account takeover, including super admin.

**Status:** ⚠️ STATIC-CONFIRMED — on 2026-08-11 the live host REJECTED a token
forged with the committed secret (401), i.e. production currently uses
*different* JWT secrets. This is still CRITICAL because:
1. the secret is public forever (git history);
2. the same file contains the *working* DB + super-admin credentials — so the
   secret was real at some point and may be re-introduced;
3. **prescription QR HMAC keys are derived from the same `JWT_SECRET`.**

**Severity:** Critical (account takeover when the secret matches)

---

## 1. Vulnerability Identification Process

### 1.1 Static review — where the secret is used

- `src/auth/strategies/jwt.strategy.ts:19-26` — signs/validates access tokens
  with `JWT_SECRET`.
- `src/auth/strategies/jwt-refresh.strategy.ts:19-25` — refresh tokens with
  `JWT_REFRESH_SECRET`.
- `src/prescriptions/prescriptions.service.ts:623-626` — the prescription
  QR-code HMAC uses `JWT_SECRET` as its key:
  ```typescript
  const secret = this.configService.get<string>('JWT_SECRET') ||
    'default-prescription-secret-key-2026';
  ```
  So the leaked secret also lets an attacker forge valid prescription QR
  hashes (combined with the QR payload structure).

### 1.2 The forgery primitive

`JwtStrategy.validate()` (`jwt.strategy.ts:29-44`) trusts `payload.sub`,
looks up the user in the DB, and returns that user's **DB role**:

```typescript
async validate(payload: any) {
  const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
  if (!user) throw new UnauthorizedException();
  return { sub: user.id, email: user.email, role: user.role,
           ...(payload.hospitalId != null && { hospitalId: payload.hospitalId }) };
}
```

Consequences:
- Forge `{sub: <any-user-id>}` → authenticated as that user.
- The `hospitalId` claim is copied from the **payload** (not the DB) → a
  forger can attach any hospital to any user for routes trusting it.

### 1.3 Dynamic test (2026-08-11)

Forged a token for the super admin with the committed secret:

```bash
node forge_jwt.js 216878ea-1a2e-478a-9d68-2b4c603d0669   # super admin id
curl -H "Authorization: Bearer <forged>" $BASE/api/super-admin/analytics
→ 401 Unauthorized
```

**Result:** production JWT secrets differ from the committed ones **today**.
The forge was rejected. This does NOT reduce severity — see the summary.

---

## 2. Attack Chain (when secret matches / is reused)

```
Read JWT_SECRET from public .env.example
  → forge {sub: <target user id>} signed with JWT_SECRET
  → any API call authenticated as the target
  → sub = super admin id → total platform control
Also:
  → forge prescription QR hash (JWT_SECRET reused) → tamper-proof-looking QR
```

---

## 3. Evidence (2026-08-11)

```
Forged token: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.ey...
GET /api/super-admin/analytics with forged token → 401 (prod secret differs)
```

---

## 4. Files

| File | Purpose |
|---|---|
| `exploit.js` | Reusable JWT forgery script (parameterised secret via env) |
| `remediation.md` | Step-by-step remediation |
