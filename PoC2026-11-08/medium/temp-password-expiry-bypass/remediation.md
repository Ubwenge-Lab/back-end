# Remediation — Temp Password Expiry Bypass

## Priority: P2

### 1. Enforce expiry in changeBranchPassword (and all temp-password flows)
```typescript
if (branch.tempPasswordHash && branch.tempPasswordExpiry) {
  if (branch.tempPasswordExpiry < new Date()) {
    throw new ForbiddenException('Temporary password has expired. Request a new one.');
  }
}
```
Audit the other temp-password consumers for the same check:
- `changeBranchPassword` (branch managers) ← missing
- `activateHospitalStaff` (hospital staff) ← present
- staff `change-password` flow (`staff.service.ts`) — verify

### 2. Invalidate temp passwords on expiry
- A cron/on-login step should null `tempPasswordHash` when
  `tempPasswordExpiry` has passed, so stale credentials can never be used.

### 3. Never log or email temp passwords
- See `email-html-injection-credential-logging` pack — remove
  `console.log(TEMP PASSWORD)`.

### 4. Tests
- Create branch manager with short-lived temp password → wait for expiry →
  change-password with the temp password → expect 403.

### Acceptance criteria
- [ ] Expired temp passwords are rejected by change-password
- [ ] Stale temp hashes are purged
- [ ] Regression test covers the expiry path
