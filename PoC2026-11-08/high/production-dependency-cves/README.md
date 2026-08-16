# Production Dependency CVEs — HIGH (Audit-Confirmed)

## Vulnerability Summary

`npm audit --omit=dev` reports **9 high + 1 moderate + 1 low** vulnerabilities
in production dependencies. Most are remote Denial-of-Service in the exact
libraries this app exposes to the internet (upload handling and WebSockets).

**Status:** ✅ CONFIRMED via `npm audit` — 2026-08-11
**Severity:** High (DoS on exposed components)

---

## 1. Vulnerability Identification Process

### 1.1 Static review

`package.json` pins `multer ^2.1.1`, `socket.io ^4.8.3`,
`@nestjs/swagger ^11.2.4`, etc. These sit in the vulnerable ranges:

| Advisory | Component | Issue | Severity |
|---|---|---|---|
| GHSA-72gw-mp4g-v24j | multer | DoS via deeply nested field names | High |
| GHSA-3p4h-7m6x-2hcm | multer | Incomplete cleanup of aborted uploads | High |
| GHSA-2m8v-j782-fhvr | socket.io-parser | Zero-attachment memory exhaustion | High |
| GHSA-96hv-2xvq-fx4p | ws (via engine.io, socket.io-adapter) | Memory exhaustion DoS | High |
| GHSA-52cp-r559-cp3m / GHSA-5p4m-2wfm-xmqj | js-yaml (via @nestjs/swagger) | Quadratic CPU (CVE-2026-59870) | High/Mod |

The upload controller uses `FileInterceptor` (multer) and the notifications
gateway exposes `socket.io` — both are reachable by anonymous or low-privilege
clients.

### 1.2 Dynamic check

```bash
cd back-end && npm audit --omit=dev
# 11 vulnerabilities (1 low, 1 moderate, 9 high)
```

---

## 2. Attack Chain

```
Anonymous socket.io client (or any authenticated user)
  → send many small/fragmented WS frames  → ws/socket.io-parser memory
    exhaustion → node OOM → full service outage
Any authenticated user
  → POST /upload/* with deeply nested multipart fields → multer DoS → 502s
```

---

## 3. Evidence (2026-08-11)

```
$ npm audit --omit=dev
  11 vulnerabilities (1 low, 1 moderate, 9 high)
  multer: fix available via npm audit fix
  ws / socket.io-parser / engine.io: fix available via npm audit fix
  js-yaml (via @nestjs/swagger): fix available
```

---

## 4. Files

| File | Purpose |
|---|---|
| `exploit.sh` | Re-run the audit + produce the vulnerable-graph summary |
| `remediation.md` | Step-by-step remediation |
