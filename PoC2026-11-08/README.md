# PoC2026-11-08 — E-Vuze Backend Security Assessment

**Date:** 2026-08-11
**Target:** `https://pharmacy-backend-hmir.onrender.com/api`
**Method:** authorized gray-box assessment (full source access + live testing)
**Result:** **TOTAL COMPROMISE** — 7 critical / 6 high / 6 medium / 3 low

> ⚠️ **DO NOT commit this folder to the public repository as-is.**
> READMEs and scripts reference the exact live credentials used during the
> test (parameterized via env vars, but still sensitive). Store this pack
> outside the git repo, in a private repo, or a secrets-managed location.

---

## Executive Summary

The hosted platform was breached end-to-end on 2026-08-11:

| # | Exploit | Status |
|---|---------|--------|
| 1 | Live production DB accessed with credentials from the public repo | ✅ LIVE |
| 2 | Super-admin login with the password from the public repo | ✅ LIVE |
| 3 | Fake MTN webhook marked an unpaid order as PAID | ✅ LIVE |
| 4 | Patient A created a payment on Patient B's order (ownership bypass) | ✅ LIVE |
| 5 | PHI + business data dumped without authentication | ✅ LIVE |
| 6 | Anonymous WebSocket client intercepted super-admin notifications | ✅ LIVE |
| 7 | JWT signing keys in public repo (forgery primitive) | ⚠️ STATIC |
| 8-22 | See per-pack READMEs | mixed |

**Root causes (all one theme):** real secrets in a public repo · no global
auth guard (public-by-default routing) · no webhook signature verification ·
missing ownership checks · unauthenticated realtime channel.

---

## Structure

```
PoC2026-11-08/
├── critical/   (7)  — database-credential-exposure, super-admin-account-takeover,
│                      mtn-webhook-payment-forgery, payment-ownership-bypass,
│                      unauthenticated-data-exposure, websocket-notification-hijack,
│                      jwt-signing-key-exposure
├── high/       (6)  — seed-default-passwords, swagger-public-exposure,
│                      production-dependency-cves, cross-branch-manual-verify-bypass,
│                      ssrf-prescription-fileurl, email-html-injection-credential-logging
├── medium/     (6)  — user-enumeration, verification-code-bruteforce,
│                      temp-password-expiry-bypass, csv-formula-injection,
│                      flutterwave-mock-mode, notification-relational-ids-dropped
└── low/        (3)  — appointment-checkin-role-bypass, broad-cors-configuration,
                       oversized-payload-dos
```

Each exploit folder contains **3 files**:

| File | Purpose |
|---|---|
| `README.md` | How the vulnerability was identified (static + dynamic process, code refs, evidence) |
| `exploit.sh` / `exploit.js` | Reusable, parameterized exploit — run it yourself |
| `remediation.md` | Step-by-step fix with acceptance criteria |

---

## How to run the exploits

All scripts are **parameterized** — no secrets are hard-coded inside:

```bash
# common pattern
export BASE='https://pharmacy-backend-hmir.onrender.com/api'
export DB_URL='postgresql://USER:PASS@HOST:5432/DB?sslmode=require'   # DB pack
./critical/database-credential-exposure/exploit.sh
```

Requirements: `curl`, `jq`, `psql` (DB pack), `node` + `jsonwebtoken`
(JWT pack), `socket.io-client` (WS pack — `npm install socket.io-client`).

> 🛡️ **Safety:** Several exploits MUTATE data (webhook forgery marks orders
> paid; ownership bypass creates payments; WS trigger registers accounts).
> Use only against your own test instance and restore state afterwards
> (the READMEs document how).

---

## Priority remediation (short version)

1. **P0 — Rotate everything.** DB (Supabase + Neon), JWT pair, super admin
   password, Resend, Gemini, Flutterwave. Purge git history. Move to a
   secrets manager.
2. **P0 — Authenticate the MTN webhook** (HMAC + provider re-verification).
3. **P0 — Make `JwtAuthGuard` global** (public-by-exception), guard the
   endpoints in `unauthenticated-data-exposure`, require WS auth.
4. **P0 — Ownership checks** in all payment methods + branch checks in
   manual verify.
5. **P1 — Kill seed/default passwords in prod; disable Swagger in prod;
   upgrade vulnerable deps; fix SSRF; escape email HTML; stop logging
   temp passwords.**
6. **P2/P3** — the medium/low packs.

See `security/exploits.md` (2026-07-09) — the majority of issues reported
there remain present. This pack supersedes it with live confirmation.

---

## Cleanup performed after testing

- Webhook-forged order restored to `paymentStatus=PENDING`
- Cross-patient payment row deleted
- Throwaway hospital + its notification removed
- All verified via DB queries

## Suggested next steps

1. File these as `bd` issues (severity + PoC reference) for the team.
2. Start the P0 fixes (I can implement + test them).
3. Re-test after remediation and archive this pack.
