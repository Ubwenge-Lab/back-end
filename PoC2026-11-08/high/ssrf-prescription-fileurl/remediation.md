# Remediation — SSRF via Prescription fileUrl

## Priority: P1

### 1. Stop fetching arbitrary URLs entirely (best fix)
Prescriptions should be uploaded **as files** through the upload controller
(`/api/upload/prescription`), which returns a `data:` URI or an object key.
The AI pipeline should accept only:
- `data:` URIs (already handled), or
- URLs that were created by the upload service itself.

### 2. If legacy URL fetching must stay, gate it hard
```typescript
private isSafeUrl(u: string): boolean {
  try {
    const parsed = new URL(u);
    if (!['https:', 'http:'].includes(parsed.protocol)) return false;
    const host = parsed.hostname.toLowerCase();
    if (host === 'localhost' || host.endsWith('.local')) return false;
    if (host === '169.254.169.254') return false;               // cloud metadata
    if (/^10\.|^192\.168\.|^172\.(1[6-9]|2\d|3[01])\./.test(host)) return false; // RFC1918
    if (host.endsWith('.internal') || host.endsWith('.aws')) return false;
    // resolve + re-check ALL A/AAAA records too (DNS rebinding)
    return true;
  } catch { return false; }
}
```
- Reject when the DNS resolution returns a private/link-local address
  (protect against DNS rebinding).
- Enforce a response size cap (e.g. 5 MB) and a timeout.
- Only allow `image/*` and `application/pdf` content types.

### 3. Run the fetch in an isolated worker
- Perform downloads in a sandboxed worker/container with egress restricted
  to public internet via a proxy allow-list.

### 4. Tests
- Unit tests for `isSafeUrl` (metadata IP, RFC1918, rebinding, non-http).
- Integration: submit `fileUrl=http://169.254.169.254/...` → rejected 400.

### Acceptance criteria
- [ ] Prescriptions accept uploads, not arbitrary URLs
- [ ] If URLs allowed: private/metadata hosts rejected, size+timeout enforced
- [ ] Tests cover SSRF vectors
