# Remediation — Public Swagger / API Docs Exposure

## Priority: P1

### 1. Disable Swagger in production
```typescript
// main.ts
const isProd = process.env.NODE_ENV === 'production';
if (!isProd) {
  SwaggerModule.setup('api/docs', app, document);
}
```

### 2. (If docs are needed in prod) gate them behind auth
- Protect `/api/docs` and `/api/docs-json` with a middleware that checks an
  admin-only cookie/header, or
- Serve docs from a separate internal network, or
- Use a strong shared token (`DOCS_TOKEN`) in a header.

### 3. Reduce schema leakage
1. Never mark request DTOs with `@ApiProperty()` for internal-only fields.
2. Exclude `password`, `refreshToken`, `verificationCode` from Swagger models
   with `@ApiHideProperty()` / `@Exclude()`.
3. Use distinct DTOs for public vs. internal routes.

### Acceptance criteria
- [ ] `/api/docs*` returns 404 in production (or requires auth)
- [ ] No auth secrets appear in any schema
