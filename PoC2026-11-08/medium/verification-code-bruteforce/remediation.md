# Remediation — Verification Code Brute-Force

## Priority: P2

### 1. Increase code entropy
- 6+ digits or an 8-char alphanumeric code (alphanumeric preferred).
- Keep expiry short (≤ 10 min for OTP-style codes).

### 2. Add per-account attempt limits
```typescript
// users table: verificationAttempts Int @default(0)
if (user.verificationAttempts >= 5) {
  throw new BadRequestException('Too many attempts. Request a new code.');
}
// on wrong code:
await this.prisma.user.update({
  where: { id: user.id },
  data: { verificationAttempts: { increment: 1 } },
});
// on success: reset to 0
```
Invalidate the code after N failures and require `resend-verification`.

### 3. Fix rate limiting
1. Throttle **per email + per IP** (not just per IP).
2. Remove the `trust proxy` ambiguity: use a dedicated client-IP resolver
   that trusts only the platform's proxy (Render) — otherwise
   `X-Forwarded-For` spoofing bypasses the 5/min limit.
3. Cap `resend-verification` per email (e.g. 3/hour) to stop email bombing.

### 4. Storage hardening
- Hash verification codes at rest (`sha256(code)`) — the DB compromise pack
  currently lets an attacker read codes in plaintext and verify any email.

### Acceptance criteria
- [ ] Codes are ≥6 digits/alphanumeric with short expiry
- [ ] 5 wrong attempts invalidate the code
- [ ] Throttle is per email+IP; XFF spoofing no longer bypasses it
- [ ] Codes are hashed in the DB
