# Remediation — Unauthenticated Data Exposure

## Priority: P0

### 1. Make authentication opt-out, not opt-in
Register `JwtAuthGuard` globally and allow public routes explicitly:

```typescript
// app.module.ts providers
{
  provide: APP_GUARD,
  useClass: JwtAuthGuard,      // global — everything requires a token
}
// keep RolesGuard scoped to controllers/handlers that need it
```

Then every `@Public()` becomes a deliberate, reviewable exception (currently
`@Public()` is *optional* and unguarded handlers are the default).

### 2. Guard the specific endpoints found
- `GET /api/medications/:id` → `@UseGuards(JwtAuthGuard)` (at minimum)
- `GET /api/medications/search` → require any authenticated user
- `GET /api/pharmacies` → return a **public DTO** (name, address, phone,
  operating hours, coordinates) with no `userId`, certificates, or
  representative PII; or require auth for the full record
- `GET /api/appointments/:id/telemedicine-room` → **remove `@Public()`** and
  make the ownership check mandatory (throw 401 when unauthenticated):
  ```typescript
  if (!userId || !role) throw new UnauthorizedException();
  ```
- `GET /api/doctors/:id/slots` → require auth

### 3. Apply response-shaping
Use `class-transformer` `@Exclude()` DTOs or `select` projections so sensitive
fields (`rdbCertificate`, `pharmacyLicense`, `businessRegistration`,
`representativeName`, `userId`, stock `quantity`) never leave the API except
to the right role (owner/manager/super-admin).

### 4. Add a regression sweep
- Automated test: every route in the Swagger spec that lacks a security
  requirement and is not on the public allowlist fails with 401.
- CI lint rule: forbid `@Public()` without a comment referencing the risk
  owner.

### Acceptance criteria
- [ ] All endpoints return 401 without a valid token (except the short public
      allowlist: login, register, verify-email, forgot/reset-password, webhook)
- [ ] Public pharmacy/medication views contain no certificates/PII/stock
- [ ] Telemedicine room returns 401 when unauthenticated
