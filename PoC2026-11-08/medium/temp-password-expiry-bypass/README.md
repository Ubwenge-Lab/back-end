# Temp Password Expiry Bypass — MEDIUM (Static-Confirmed)

## Vulnerability Summary

`PUT /api/auth/branch/change-password` validates the temporary password but
**never checks `tempPasswordExpiry`** (unlike `login()` which does). A
temporary branch-manager password that has expired can still be used to set a
new permanent password — i.e. account takeover by anyone holding a stale temp
password.

**Status:** ⚠️ STATIC-CONFIRMED (code review) — 2026-08-11
**Severity:** Medium (expired credential reuse → account takeover)

---

## 1. Vulnerability Identification Process

### 1.1 Static review

`src/auth/auth.service.ts:972-1003`:

```typescript
async changeBranchPassword(userId: string, dto: ChangeBranchPasswordDto) {
  if (dto.newPassword !== dto.confirmPassword) throw new BadRequestException(...);

  const branch = await this.prisma.branch.findFirst({ where: { managerId: userId } });
  if (!branch) throw new BadRequestException('Branch not found');

  const isValid = await bcrypt.compare(dto.tempPassword, branch.tempPasswordHash);
  if (!isValid) throw new BadRequestException('Invalid temporary password');

  // ← NO check of branch.tempPasswordExpiry here!
  // login() (line 190-199) DOES check it. This path does not.
  const hashedPassword = await bcrypt.hash(dto.newPassword, 12);
  await this.prisma.$transaction([...]);   // sets permanent password
}
```

The endpoint requires an authenticated session (`@UseGuards(JwtAuthGuard)`),
so the exploit applies to a branch manager whose temp password has expired
(or leaked later): they can still log in (login blocks expired temps) but the
**change-password endpoint does not**, so an attacker holding the expired
temp password + a valid session (e.g. via the WS/account compromise chains)
can force a new password and lock the real manager out.

### 1.2 Preconditions
- A branch manager created with a temp password that has since expired
  (5-day expiry, `branches.service.ts`).
- Attacker knows the (expired) temp password — e.g. from the credential
  logging finding, the DB compromise, or the original invitation email.

---

## 2. Attack Chain

```
Obtain expired temp password (log/DB/email)
  → login (fails: expired)   but:
  → PUT /auth/branch/change-password {tempPassword, newPassword, confirm}
    → 200, permanent password set
  → login with new password → branch manager account owned
```

---

## 3. Evidence

```
Source: auth.service.ts changeBranchPassword() — missing expiry check
(compare with login() which enforces it).
```

---

## 4. Files

| File | Purpose |
|---|---|
| `exploit.sh` | Change-password with an expired temp password (parameterised) |
| `remediation.md` | Step-by-step remediation |
