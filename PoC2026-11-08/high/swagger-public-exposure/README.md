# Public Swagger / API Docs Exposure — HIGH (Live-Confirmed)

## Vulnerability Summary

The complete OpenAPI specification (167 endpoints, all DTO schemas, admin
routes, parameter shapes) is served publicly at `/api/docs` and
`/api/docs-json`. It is an exact attack-surface map for anyone.

**Status:** ✅ CONFIRMED ON LIVE — 2026-08-11
**Severity:** High (reconnaissance enabler)

---

## 1. Vulnerability Identification Process

### 1.1 Static review

`src/main.ts:97-105` — Swagger is set up unconditionally:

```typescript
const config = new DocumentBuilder()...addBearerAuth().build();
const document = SwaggerModule.createDocument(app, config);
SwaggerModule.setup('api/docs', app, document);
```

There is no `NODE_ENV === 'production'` guard.

### 1.2 Dynamic confirmation

```bash
curl -s $BASE/docs-json | jq '.paths | length'
→ 167

curl -s $BASE/docs-json | jq -r '.paths | keys[]' | grep -E 'super-admin|payments|claims'
→ /api/admin/claims
   /api/payments/webhook/mtn
   /api/super-admin/analytics
   ...
```

Every admin and payment route (including the forged webhook) is documented
with request/response schemas — including which parameters to send.

---

## 2. Attack Chain

```
GET /api/docs-json (no auth)
  → full endpoint inventory + DTO shapes
  → guides the webhook forgery, IDOR, ownership-bypass, and admin exploits
```

---

## 3. Evidence (2026-08-11)

```
GET /api/docs-json → 200, 167 paths, all schemas
GET /api/docs      → 200, interactive UI
```

---

## 4. Files

| File | Purpose |
|---|---|
| `exploit.sh` | Dump + summarize the public OpenAPI spec (parameterised) |
| `remediation.md` | Step-by-step remediation |
