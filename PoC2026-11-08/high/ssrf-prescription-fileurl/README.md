# SSRF via Prescription fileUrl — HIGH (Static-Confirmed)

## Vulnerability Summary

A patient can submit a `fileUrl` in `POST /api/prescriptions`. The server
then fetches that URL (`axios.get`) with **no allow-list** — a classic
Server-Side Request Forgery (SSRF) into internal networks, cloud metadata,
and private services, plus a remote-download DoS vector.

**Status:** ⚠️ STATIC-CONFIRMED (code review) — 2026-08-11
**Severity:** High (internal network pivot / DoS)

---

## 1. Vulnerability Identification Process

### 1.1 Static review

`src/prescriptions/prescriptions.service.ts:66-95` — `create()` takes
`dto.fileUrl` straight from the client and passes it to
`processPrescriptionWithAI()` → `extractMedicationsFromPrescription()`
→ `downloadImageAsBase64()`:

```typescript
private async downloadImageAsBase64(fileUrl: string): Promise<string> {
  if (fileUrl.startsWith('data:')) { ... }          // OK path

  // Legacy: HTTP/HTTPS URL (S3 or other)
  try {
    const response = await axios.get(fileUrl, {     // ← SSRF
      responseType: 'arraybuffer',
    });
    return Buffer.from(response.data).toString('base64');
  } catch ...
}
```

`fileUrl` is validated only as `@IsString()` in `CreatePrescriptionDto` —
there is no scheme/host allow-list, no SSRF filtering (RFC1918, link-local,
metadata IPs), and no size cap on the response.

### 1.2 Why it matters here

- The app runs on Render (AWS). The metadata endpoint
  `http://169.254.169.254/latest/meta-data/` is reachable from within the
  provider network → IAM credentials / instance data.
- Internal services (Redis, internal APIs, other backends) on private
  networks can be probed via timing/error differences.
- Any patient account can trigger this (it is `@Roles(Role.PATIENT)`).

### 1.3 Dynamic note

Not exercised against the live instance (it would touch internal
infrastructure and the response is consumed by Gemini, so blind SSRF only).
The vulnerable path is confirmed by source.

---

## 2. Attack Chain

```
Patient (or any role) creates prescription:
  POST /api/prescriptions {"fileUrl":"http://169.254.169.254/latest/meta-data/iam/security-credentials/","fileName":"x","fileType":"application/pdf"}
  → server fetches internal endpoint
  → blind SSRF (response goes to Gemini) — timing/errors reveal internal state
  → combined with leaked DB creds, becomes a lateral-movement primitive
```

---

## 3. Evidence (2026-08-11)

```
Source: prescriptions.service.ts downloadImageAsBase64() — axios.get(fileUrl)
        with no allow-list, no block-list, no size cap.
```

---

## 4. Files

| File | Purpose |
|---|---|
| `exploit.sh` | Blind-SSRF probe PoC (parameterised, uses safe targets) |
| `remediation.md` | Step-by-step remediation |
