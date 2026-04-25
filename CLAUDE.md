# E-Vuze Backend — Session Notes

## Project Overview
NestJS + Prisma + PostgreSQL (Neon) backend for the E-Vuze pharmacy platform.
- Port: `4000`
- Global prefix: `/api`
- Swagger docs: `http://localhost:4000/api/docs`
- DB: Neon PostgreSQL (pooled via `DATABASE_URL`, direct via `DIRECT_URL`)
- Git user: terancebana

## How to Run
```bash
npm run start:dev
```
Requires a `.env` file in the project root (copy from `.env.example` and fill in real values).
Required env vars: `DATABASE_URL`, `DIRECT_URL`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, `RESEND_API_KEY`.
Optional (feature-gated): `GEMINI_API_KEY` — without it, AI prescription reading is disabled but the app runs fine.

---

## Session Progress (2026-04-14)

### 1. Got the server running
- Initial problem: no `.env` file → app crashed on startup with `JWT_SECRET is not defined`
- Once `.env` was added, server started cleanly on `localhost:4000`
- Confirmed live via curl: `GET /` returns 200 with the landing page HTML
- Only non-fatal warning: `GEMINI_API_KEY not set - AI prescription reading disabled`

### 2. Reviewed PR #27 — feat: Add MTN webhook and order status logic
**Branch:** `feat/eric-location-service` (by erichagenimana)
**Files changed:**
- `src/payments/payments.service.ts` — added `processMtnPayment()` method
- `src/payments/payments.controller.ts` — added `POST /api/payments/webhook/mtn` endpoint
- `src/payments/dto/mtn-callback.dto.ts` — new DTO for MTN callback payload

**What the PR does:**
Implements the MTN MoMo webhook handler. When MTN calls back after a payment:
1. Looks up the order by `externalId`
2. On `SUCCESSFUL`: marks payment as `COMPLETED`, calls `handlePaymentSuccess()` to update order + deduct stock, notifies the patient
3. On failure: marks payment as `FAILED`

**PR assessment:** Good MVP-level work. Logic is correct, reuses existing services cleanly, DTO is properly structured. Approve with comments.

---

### 3. Security Findings (documented in `tests/mtn-webhook-security-findings.md`)

| # | Issue | Severity | Status |
|---|-------|----------|--------|
| 1 | No webhook signature verification — `@Public()` endpoint accepts any POST with no origin check | **Critical** | Unresolved — MTN keys not yet available, but must be fixed before go-live |
| 2 | `externalId` amount and payment method not cross-validated | High | Unresolved |
| 3 | `console.log` dumps full webhook payload including transaction IDs | Medium | Unresolved |
| 4 | No idempotency guard — MTN retries webhooks, could double-process | Medium | Unresolved |

> Note: MTN API keys are not yet available, so payments are not functional right now. The security fixes are not blocking current development but **must be done before MTN keys are plugged in**.

---

## Session Progress (2026-04-16)

### 1. Created test accounts on production (`http://evuze.ubwengelab.rw/api`)

**Patient account**
- Endpoint: `POST /api/auth/register/patient`
- Email: `test.patient@evuze.dev` / Password: `Evuze@2026`
- User ID: `cc8440ba-f986-42aa-accc-638debf2788d`
- Status: registered — email verification pending

**Pharmacy account**
- Endpoint: `POST /api/auth/register/pharmacy`
- Email: `test.pharmacy@evuze.dev` / Password: `Evuze@2026`
- Pharmacy: Test Pharmacy | Rep: Test Rep
- User ID: `70b0fd83-12f2-4cde-bd32-57a89bead432`
- Pharmacy ID: `6db7b496-1767-4312-be2a-c996dfa6d26b`
- Status: `APPROVED` (email verified with code `38918`, admin already approved)

Full credentials saved in `tests/credentials.md`.

---

### 2. Production endpoint audit — PUT/DELETE returning `000`

Ran a full endpoint sweep against `http://evuze.ubwengelab.rw/api`. All `GET` and `POST` routes responded correctly (200/400/401). Every single `PUT` and `DELETE` returned `000` (empty reply — server closed connection with no HTTP response). Confirmed working fine on localhost.

**Root cause investigation:**

| Step | Finding |
|------|---------|
| Nginx config (`/etc/nginx/sites-available/evuze-api`) | No `limit_except` — config looked correct |
| Syntax error found | Stray `"` in frontend block: `proxy_set_header Connection $connection_upgrade";` — caused nginx to silently keep running old config on reload |
| After fixing typo + `nginx -s reload` | DELETE still returned `000` |
| `dist/branches/branches.controller.js` | Up to date — `Delete(':id')` decorator confirmed present, compiled 2026-04-05 |
| pm2 logs during live DELETE attempt | Login queries appeared (POST hit NestJS) but **zero trace of DELETE** — NestJS never received it |
| Production git state | `HEAD` at `3b9e27e` — same as local `main`, code is current |

**Current status: UNRESOLVED — active investigation in progress**

Full debugging timeline:
| Step | Finding |
|------|---------|
| Nginx config syntax error fixed (`"` typo) | DELETE still failed after reload |
| `dist/branches/branches.controller.js` | Correct, `Delete(':id')` present |
| pm2 logs | Zero trace of DELETE — NestJS never received it |
| `curl localhost:4000 DELETE` from AOS server | **Worked** — `{"message":"Branch deleted successfully"}` |
| `curl localhost:4000 DELETE` confirms | Issue is 100% between Nginx and NestJS, not NestJS itself |
| Nginx full config dump (`nginx -T`) | Clean — no `limit_except`, no `444`, no `deny`, no ModSecurity |
| iptables on AOS server | Completely empty — no rules |
| nftables, ufw | Both inactive/empty |
| conf.d | Empty |
| Nginx access log | No entries even for GET — stale file handle (log rotation issue) |
| DELETE/PUT on root path `/` also returns `000` | Not specific to `/api/` — affects ALL methods |
| Nginx error log | Empty |
| Only Nginx on port 80 (`ss -tlnp`) | Confirmed |
| No CDN/proxy in response headers | Direct server, no Cloudflare etc. |
| **Leading hypothesis** | **AOS (Rwandan hosting provider) has network-level firewall blocking PUT/DELETE before packets reach the VM** |

**Branch deleted successfully via localhost** — test branch `b90ea643-7bae-4d48-998b-8da1e266a595` is gone.

---

### 3. Local VM verification test (2026-04-17) — COMPLETED ✓

**CONCLUSION: AOS network firewall is confirmed as the root cause.**

Side-by-side proof:
| Server | `DELETE /api/branches/00000000-...` response |
|--------|----------------------------------------------|
| Local VM through Nginx (via ngrok) | `HTTP 404 {"message":"Branch not found"}` ✓ |
| AOS production through Nginx | `Empty reply from server` ✗ |

Same code, same Nginx config, same request — only difference is AOS's network.

**VM setup (still running, can be reused):**
- Hypervisor: KVM/virt-manager on Fedora host
- VM OS: Ubuntu, nginx/1.24.0
- VM IP: `192.168.122.194` (libvirt NAT)
- App running via pm2: `cd ~/back-end && pm2 start dist/main.js --name evuze-api`
- Nginx config: `/etc/nginx/sites-available/evuze-api` (server_name _; proxy → localhost:4000)
- KVM internet access: requires these rules on Fedora host after reboot:
  ```bash
  sudo iptables -I FORWARD 1 -i virbr0 -j ACCEPT
  sudo iptables -I FORWARD 2 -o virbr0 -m state --state RELATED,ESTABLISHED -j ACCEPT
  sudo iptables -t nat -A POSTROUTING -s 192.168.122.0/24 ! -d 192.168.122.0/24 -j MASQUERADE
  ```

**Demo account on local VM DB:**
- Email: `demo.pharmacy@evuze.dev` / Password: `Evuze@2026`
- Status: PENDING (verified, not approved)
- User ID: `8b8dbdc2-d0e8-4f17-a16b-a5e342b413cc`
- Pharmacy ID: `6cf5b196-c9b9-49f3-ad67-294abc2c20d9`

**Test scripts:**
- `tests/test-endpoints.sh` — runs against AOS production (`http://evuze.ubwengelab.rw/api`)
- `tests/test-endpoints-local.sh` — runs against local VM via ngrok (includes `ngrok-skip-browser-warning` header)

**ngrok URL (changes each session):** start with `ngrok http 80` on the VM, update `BASE_URL` in `tests/test-endpoints-local.sh` if needed.

---

## Pending / Next Steps
- [ ] **URGENT: Contact AOS support** — show them the side-by-side DELETE proof and request they allow PUT/DELETE/PATCH through their network firewall
- [ ] Once AOS fixes firewall → re-run `tests/test-endpoints.sh` against production to confirm all endpoints pass
- [ ] Add MTN webhook signature verification once MTN API keys are obtained
- [ ] Add idempotency check in `processMtnPayment()` (check if payment is already `COMPLETED` before processing)
- [ ] Remove `console.log` of webhook payload in `payments.controller.ts`
- [ ] Cross-validate `amount` and `paymentMethod` in `processMtnPayment()`
- [ ] Add `GEMINI_API_KEY` to `.env` if AI prescription reading is needed
- [ ] Fix branch naming — `feat/eric-location-service` is misnamed for a payments PR

---

## Key Files Reference
| File | Purpose |
|------|---------|
| `src/main.ts` | App bootstrap, port 4000, CORS, Swagger setup |
| `src/app.module.ts` | Module registry |
| `src/prisma/schema.prisma` | Full DB schema |
| `src/payments/payments.service.ts` | Payment logic incl. new MTN webhook handler |
| `src/payments/payments.controller.ts` | Payment routes incl. `POST /api/payments/webhook/mtn` |
| `src/payments/dto/mtn-callback.dto.ts` | MTN webhook payload DTO |
| `src/auth/strategies/jwt.strategy.ts` | JWT validation — throws if `JWT_SECRET` missing |
| `tests/mtn-webhook-security-findings.md` | Full security audit of PR #27 |


<!-- BEGIN BEADS INTEGRATION v:1 profile:minimal hash:ca08a54f -->
## Beads Issue Tracker

This project uses **bd (beads)** for issue tracking. Run `bd prime` to see full workflow context and commands.

### Quick Reference

```bash
bd ready              # Find available work
bd show <id>          # View issue details
bd update <id> --claim  # Claim work
bd close <id>         # Complete work
```

### Rules

- Use `bd` for ALL task tracking — do NOT use TodoWrite, TaskCreate, or markdown TODO lists
- Run `bd prime` for detailed command reference and session close protocol
- Use `bd remember` for persistent knowledge — do NOT use MEMORY.md files

## Session Completion

**When ending a work session**, you MUST complete ALL steps below. Work is NOT complete until `git push` succeeds.

**MANDATORY WORKFLOW:**

1. **File issues for remaining work** - Create issues for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **PUSH TO REMOTE** - This is MANDATORY:
   ```bash
   git pull --rebase
   bd dolt push
   git push
   git status  # MUST show "up to date with origin"
   ```
5. **Clean up** - Clear stashes, prune remote branches
6. **Verify** - All changes committed AND pushed
7. **Hand off** - Provide context for next session

**CRITICAL RULES:**
- Work is NOT complete until `git push` succeeds
- NEVER stop before pushing - that leaves work stranded locally
- NEVER say "ready to push when you are" - YOU must push
- If push fails, resolve and retry until it succeeds
<!-- END BEADS INTEGRATION -->
