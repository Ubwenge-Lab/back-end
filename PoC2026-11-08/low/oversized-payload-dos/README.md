# Oversized Payload / Storage DoS — LOW (Static-Confirmed)

## Vulnerability Summary

The HTTP body limit is raised to **50 MB** (`main.ts:29-30`) and uploads are
stored as **base64 blobs directly in PostgreSQL** (up to 10 MB per file).
Combined with upload endpoints that only require "any authenticated user",
this enables storage exhaustion and slow-request DoS.

**Status:** ⚠️ STATIC-CONFIRMED (code review) — 2026-08-11
**Severity:** Low–Medium (resource exhaustion; needs an account)

---

## 1. Vulnerability Identification Process

### 1.1 Static review

`src/main.ts:28-30`:

```typescript
app.use(json({ limit: '50mb' }));
app.use(urlencoded({ extended: true, limit: '50mb' }));
```

`src/upload/upload.service.ts` — files become `data:<mime>;base64,...`
(≈1.33× the raw size) and are stored in DB text columns.

`src/upload/upload.controller.ts:34` — `@UseGuards(JwtAuthGuard)` only:
**no role check**, so any patient can upload to any of the upload endpoints
(`/upload/license`, `/upload/prescription`, `/upload/medication-image`).

### 1.2 Impact
- A single account can fill the DB with base64 blobs (10 MB each) until the
  Supabase storage/DB quota is exhausted → availability impact.
- 50 MB JSON bodies allow slow-loris-style uploads against the memory of the
  (small) Render instance.

---

## 2. Attack Chain

```
Any registered account (self-registration is open)
  → POST /api/upload/prescription (10 MB per file, no role check)
  → repeat → DB storage exhaustion / instance memory pressure
```

---

## 3. Evidence

```
Source: main.ts body limits; upload.service.ts base64-in-DB; upload.controller
no role restriction.
```

---

## 4. Files

| File | Purpose |
|---|---|
| `exploit.sh` | Loop upload to demonstrate resource consumption (parameterised) |
| `remediation.md` | Step-by-step remediation |
