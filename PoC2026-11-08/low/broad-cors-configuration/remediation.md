# Remediation — Broad CORS Configuration

## Priority: P3

### 1. Lock the origin list
Replace the regex with exact origins from env:

```typescript
origin: (origin, cb) => {
  const allowed = new Set([...allowedOrigins, 'http://localhost:3000']);
  if (!origin || allowed.has(origin)) return cb(null, true);
  return cb(new Error('Not allowed by CORS'));
},
```

Never use `credentials: true` with a regex/wildcard origin.

### 2. If cookies are (or become) used
1. Use `SameSite=Lax|Strict` + `Secure` on the auth cookie.
2. Add CSRF tokens for state-changing endpoints.
3. Keep CORS origins exact and reviewed.

### 3. WebSocket gateway
Replace `origin: '*'` with the exact frontend origin(s).

### 4. Tests
- CORS matrix test: `evil-attacker.vercel.app` → no
  `access-control-allow-origin`.

### Acceptance criteria
- [ ] Only exact allowed origins get CORS headers
- [ ] WS origin list matches the frontend
- [ ] Cookie auth (if adopted) is CSRF-safe
