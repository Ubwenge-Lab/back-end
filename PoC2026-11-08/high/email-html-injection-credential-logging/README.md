# Email HTML Injection + Credential Logging — HIGH (Static-Confirmed)

## Vulnerability Summary

Two related weaknesses in `src/notifications/email.service.ts`:

1. **HTML injection in transactional emails** — user-controlled fields
   (`pharmacyName`, rejection `reason`, `patientName`, `orderNumber`, etc.)
   are interpolated into HTML templates without escaping. A malicious
   pharmacy name or support text can inject markup/phishing content into
   emails sent to admins and customers.
2. **Temporary passwords are logged to stdout** — staff/branch-manager
   credentials are written to application logs, where they can be exfiltrated
   via any log-shipping pipeline or the public error-reporting flow.

**Status:** ⚠️ STATIC-CONFIRMED (code review) — 2026-08-11
**Severity:** High (phishing / credential leakage to logs)

---

## 1. Vulnerability Identification Process

### 1.1 HTML injection

`email.service.ts` builds templates with string interpolation:

```typescript
// sendPharmacyApproval (reason is admin-supplied, pharmacyName is attacker-registered)
`...<strong>${pharmacyName}</strong>...${reason}...`

// sendOrderNotification (data.name, data.orderNumber from DB/user input)
`Hello <strong>${data.name}</strong>... #${data.orderNumber}`

// sendAppointmentConfirmation (data.reason from patient booking)
`<p ...>${data.reason}</p>`
```

No `escapeHtml()` is applied anywhere. Email clients don't run `<script>` in
HTML mail, but attackers can:
- inject `<a href="https://evil.example/…">` links (phishing),
- inject `<img src="https://attacker/track">` (read receipts / IP leak),
- break out of templates to alter message content (social engineering).

`reason` in `sendPharmacyApproval`/`sendPharmacyUpdateNotification` comes
from the super admin's reject payload, and `pharmacyName` is chosen at
registration (attacker-controlled for the pharmacy role).

### 1.2 Credential logging

`email.service.ts:364-367` (sendBranchCredentials), `:491-495`
(sendStaffCredentials), `:590-596` (sendHospitalStaffCredentials):

```typescript
console.log(`🔑 TEMP PASSWORD: ${tempPassword}`);
```

Combined with the global exception filter (`global-exception.filter.ts`)
that emails full error stacks to the super admin, and any log aggregator in
use, temporary credentials can leak into logs/emails.

---

## 2. Attack Chain

```
1) HTML injection:
   Register pharmacy named:  <img src=https://evil/track><a href=https://evil>Click
   → admin/customer emails contain injected markup → phishing / tracking

2) Credential logging:
   Branch manager created → temp password in server logs
   → anyone with log access (or via log-forwarding misconfig) obtains it
   → login as the branch manager before expiry
```

---

## 3. Evidence (2026-08-11)

```
Source: email.service.ts — unescaped interpolation + console.log of passwords.
```

---

## 4. Files

| File | Purpose |
|---|---|
| `exploit.sh` | Register attacker-controlled name and inspect email HTML (proof) |
| `remediation.md` | Step-by-step remediation |
