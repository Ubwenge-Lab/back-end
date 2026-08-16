# Remediation — Email HTML Injection + Credential Logging

## Priority: P1

### 1. Escape ALL dynamic values in email templates
Create a single `escapeHtml()` helper and use it for every interpolated
value:

```typescript
const escapeHtml = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!)
  );
```

Apply it to: `pharmacyName`, `branchName`, `hospitalName`, `patientName`,
`reason`, `orderNumber`, `doctorName`, `recipientName`, `message`, `status`,
`title`. Never inject unescaped user data into `href`/`src` attributes
either — validate URLs against an allow-list of schemes/hosts.

### 2. Stop logging credentials
Remove every `console.log` that prints `tempPassword` (3 sites in
`email.service.ts`). If debug logging of the onboarding flow is needed,
log a **masked** value (`${tempPassword[0]}***`).

### 3. Don't send credentials via email at all (best practice)
- Email a **one-time, expiring activation link/token** instead of a
  password.
- Or generate the temp password, email it once, and force expiry + rotation
  (already partly implemented via `tempPasswordExpiry`).

### 4. Harden logs
1. Ensure the error-alert path (`global-exception.filter.ts`) never includes
   query parameters, bodies, or stack traces with secrets — sanitize before
   emailing.
2. Centralize logging with a library that supports redaction rules
   (winston is present — add a redaction filter for `password`, `token`,
   `secret`).

### 5. Tests
- Unit test: malicious strings in all template fields render escaped.
- Integration: register pharmacy with `<img>`/`<a>` payload → email HTML
  contains `&lt;`/`&gt;` and no raw tag.

### Acceptance criteria
- [ ] No raw HTML from user input reaches email bodies
- [ ] No temp password appears in logs
- [ ] Redaction filter active in production logs
