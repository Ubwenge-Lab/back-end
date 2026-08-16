# Verification Code Brute-Force — MEDIUM (Static-Confirmed)

## Vulnerability Summary

Email verification codes are **5 digits** (`10000–99999`, ~90k space), valid
for 24 hours, stored in plaintext, and rate-limited at only 5 attempts/min/IP.
A distributed or patient attacker can brute-force the code, verify the email,
and take over an unverified account. `resend-verification` also enables
email bombing (5 emails/min/IP ≈ 7,200/day).

**Status:** ⚠️ STATIC-CONFIRMED — 2026-08-11
**Severity:** Medium (account verification bypass / email bombing)

---

## 1. Vulnerability Identification Process

### 1.1 Static review

`src/auth/auth.service.ts`:

```typescript
private generateVerificationCode(): string {
  return randomInt(10000, 99999).toString();   // ← 5 digits
}
private generateResetCode(): string {
  return randomInt(100000, 999999).toString(); // 6 digits (reset)
}
```

`src/auth/auth.controller.ts:38` throttles the whole controller at
`5 requests / 60s / IP`. `verifyEmail()` has no per-account attempt counter:

```typescript
async verifyEmail(dto: VerifyEmailDto) {
  const user = await this.prisma.user.findFirst({
    where: { email: dto.email, verificationCode: dto.code },  // ← no attempt limit
  });
  if (!user) throw new BadRequestException('Invalid verification code or email');
  ...
}
```

### 1.2 Math

- 5-digit space: 90,000 codes.
- 5 attempts/min/IP → naive single-IP brute force ≈ 18,000 min ≈ **12.5 days**.
- Distributed (many IPs) or rotating `X-Forwarded-For` (with `trust proxy 1`
  in `main.ts:26`) reduces this dramatically.
- Codes are also **readable from the DB** (see `database-credential-exposure`
  pack) — which turns this into instant verification.

---

## 2. Attack Chain

```
1) Register an account as the victim's email (or target an existing
   unverified account)
2) Either:
   a. read verificationCode from the DB (leaked creds) — instant, or
   b. brute-force 90k codes across many IPs while rate limit is per-IP
3) POST /auth/verify-email {email, code} → account verified → full access
```

---

## 3. Evidence

```
Source: auth.service.ts generateVerificationCode() (5-digit), no attempt
counter in verifyEmail(), per-IP throttling only.
```

---

## 4. Files

| File | Purpose |
|---|---|
| `exploit.sh` | Brute-force / DB-read verification PoC (parameterised) |
| `remediation.md` | Step-by-step remediation |
