# Remediation — Production Dependency CVEs

## Priority: P1

### 1. Upgrade the vulnerable packages
| Package | Vulnerable | Fixed in |
|---|---|---|
| multer | ≤ 2.1.1 | ≥ 2.1.2 (or migrate to `@nestjs/platform-express` latest) |
| socket.io / socket.io-parser | ≤ 4.2.6 parser | ≥ 4.3.0 |
| ws | ≤ 8.20.1 | ≥ 8.20.2 |
| engine.io | ≤ 6.6.8 | ≥ 6.6.9 |
| @nestjs/swagger (js-yaml) | ≤ 11.4.4 | ≥ 11.4.5 / 12.x |

```bash
npm update multer socket.io socket.io-parser engine.io ws @nestjs/swagger @nestjs/platform-express
npm audit fix --omit=dev
```

### 2. Validate the fix
```bash
npm audit --omit=dev   # expect: 0 vulnerabilities
npm test               # no regressions
```

### 3. Defense in depth for the exposed components
1. **Upload** (`FileInterceptor`):
   - Set `limits: { fileSize, fields, fieldNameSize }` on the interceptor.
   - Reject multipart bodies with deeply nested field names (or use the fixed
     multer).
2. **WebSocket** (`/notifications`):
   - Cap `maxHttpBufferSize`, ping intervals, and message counts per socket.
   - Enforce the auth handshake (see `websocket-notification-hijack` pack) —
     this removes the anonymous DoS vector.
3. Add resource limits at the platform level (Render instance memory, request
   timeouts, WAF).

### 4. Continuous dependency monitoring
- Enable Dependabot / Renovate on the repo.
- Run `npm audit` in CI and fail the build on high/critical.

### Acceptance criteria
- [ ] `npm audit --omit=dev` → 0 vulnerabilities
- [ ] Upload and WS components re-tested after upgrade
- [ ] CI blocks new vulnerable dependencies
