# Broad CORS Configuration — LOW (Static-Confirmed)

## Vulnerability Summary

CORS allows `credentials: true` with a wildcard-ish origin list including
any `*.vercel.app` subdomain, and the WebSocket gateway allows `origin: '*'`.
An attacker who controls a Vercel deployment (trivial to obtain) can make
credentialed browser requests to the API. Because the app uses Bearer tokens
(not cookies) the practical impact is limited, but the configuration is
wrong-shaped and will become dangerous the moment cookies are introduced.

**Status:** ⚠️ STATIC-CONFIRMED (code review) — 2026-08-11
**Severity:** Low (limited today; latent risk)

---

## 1. Vulnerability Identification Process

### 1.1 Static review

`src/main.ts:60-75`:

```typescript
app.enableCors({
  origin: [
    ...allowedOrigins,
    'http://localhost:3000',
    /^https:\/\/.*\.vercel\.app$/,     // ← ANY vercel.app subdomain
  ],
  credentials: true,
  ...
});
```

`src/notifications/notifications.gateway.ts:12-14`:

```typescript
cors: { origin: '*' },                  // ← any origin for the socket
```

### 1.2 Analysis

- `credentials: true` + regex origin means any Vercel-hosted page can send
  requests *with credentials*. Today the app authenticates via `Authorization:
  Bearer` (not cookies), so a browser-based attack cannot steal the token
  automatically. If the frontend ever switches to HttpOnly cookies (best
  practice), the wildcard regex becomes a **CSRF / session-hijack vector**.
- The WS gateway `origin: '*'` compounds the WS hijack issue (see the
  critical pack).

---

## 2. Attack Chain (latent)

```
Frontend switches to cookie auth
  → attacker deploys evil.vercel.app
  → evil page fetches https://api/api/... with credentials:true
  → browser auto-sends victim's cookies → CSRF to any endpoint
```

---

## 3. Evidence

```
Source: main.ts enableCors() + notifications.gateway.ts cors:'*'.
```

---

## 4. Files

| File | Purpose |
|---|---|
| `exploit.sh` | Prove the CORS origin regex matches a hostile origin |
| `remediation.md` | Step-by-step remediation |
