# Receptionist Portal Backend Endpoints

> **Scope:** `GET /appointments`, `PUT /appointments/:id/check-in`, hospital-side
> login response (`POST /auth/login`).
> **Source-verified against:** `back-end-main/src/appointments/*`, `back-end-main/src/auth/auth.service.ts`.
> **Last updated:** 2026-07-07

## Legend

| Icon | Meaning |
|------|---------|
| ✅ | Confirmed working before this change |
| ❌ | Confirmed missing before this change |
| 🔧 | Fixed as part of this change |

---

## 1. `GET /appointments` for `RECEPTIONIST` 🔧 Fixed

Before this change: `@Roles()` didn't list `RECEPTIONIST` at all, and `findAll()`'s
role branching had no `RECEPTIONIST` case — it fell through to `throw new
ForbiddenException('Access denied')` regardless of the guard.

Fixed both layers:

- Added `Role.RECEPTIONIST` to `@Roles()` on the controller route.
- Added a `RECEPTIONIST` branch to `findAll()` that resolves the caller's
  `HospitalStaff` row, then scopes to `hospitalId` **and** today's date range
  (`00:00:00` to `23:59:59` local server time). This is deliberately narrower
  than `HOSPITAL_ADMIN`'s branch (which returns full history) — a receptionist
  is working a front-desk queue, not reviewing historical records.

If no `HospitalStaff` row is found for the caller, throws `ForbiddenException`,
same pattern as the existing `PATIENT`/`DOCTOR`/`HOSPITAL_ADMIN` branches.

---

## 2. `PUT /appointments/:id/check-in` 🔧 Fixed — was more permissive than intended

Before this change, the `@Roles(Role.RECEPTIONIST)` decorator was commented out:

```ts
@Put(':id/check-in')
// @Roles(Role.RECEPTIONIST)
```

With no active `@Roles()`, `RolesGuard.canActivate()` returns `true`
unconditionally (confirmed by reading the guard directly — no required roles
means no role check at all). So **any authenticated role** could call this
route, not just receptionists. In practice this was contained by a real
service-level check, `assertHospitalStaff(userId, appointment.hospitalId)`
requires a `HospitalStaff` row at that specific hospital, so a patient or
doctor couldn't actually check a patient in. But it did mean a `NURSE` at that
hospital could, which doesn't match the route's own docstring ("Receptionist
marks the patient as physically present").

Fixed by uncommenting and restricting to `Role.RECEPTIONIST` only, matching
the documented intent. Nurses have their own dedicated `POST /:id/triage`
route for their part of the flow, they don't need check-in access too.

**This is a real behavior change worth flagging explicitly**: before this fix,
a nurse (or, at the guard layer, any authenticated user, though not one who'd
pass the service-level hospital-staff check) could hit this endpoint. After
this fix, only receptionists can. If nurses were relying on this in practice
anywhere, that would break, checked the frontend for any nurse-portal call to
`check-in` and found none, only the receptionist queue page calls it.

---

## 3. Receptionist name missing from login response 🔧 Fixed

There is no `GET /auth/me` route anywhere in `auth.controller.ts` (checked
every route, only `login`, the various `register/*`, `onboard/hospital-staff`,
`hospital-staff/activate`, `verify-email`, `resend-verification`,
`forgot-password`, `reset-password`, `refresh`, and `logout` exist). So the
login response is the only place this can be fixed, per the ticket's own
"or" framing.

The hospital-side `HospitalStaff` login branch (used by `NURSE` and
`RECEPTIONIST` logins) was returning:

```ts
user: { id, email, role, hospitalId, hospitalName, status, requiresPasswordChange }
```

No `firstName`/`lastName`, despite `HospitalStaff` having both fields directly
on the record already fetched a few lines above in the same function. Added
both to the response. This is a plainer bug than the equivalent doctor-side
issue from an earlier ticket, since there the login response body already had
the name fields (just not the JWT itself), and the gap only showed up once a
cookie cache expired. Here, the login response itself never had them, so the
"Hello Receptionist" fallback showed up immediately on first login, not just
intermittently.

**Related, not fixed here:** same as the doctor case, `generateTokens()`
still doesn't embed `firstName`/`lastName` in the JWT itself for any hospital
role. That means on a token refresh or a page reload past the point where the
cached login-response cookie expires, the name would disappear again even
with this fix, exactly the same failure mode already documented for
`DOCTOR`/`HOSPITAL_ADMIN` in the JWT Payload Expansion ticket. Worth folding
`NURSE`/`RECEPTIONIST` into that same JWT fix rather than treating it as a
separate piece of work.

---

## Priority for backend sprint

1. ~~**`GET /appointments` for RECEPTIONIST**~~ — 🔧 **Done**, shipped with this change.
2. ~~**`PUT /appointments/:id/check-in` role guard**~~ — 🔧 **Done**, shipped with this change, and tightened from "any role" to receptionist-only.
3. ~~**Receptionist name in login response**~~ — 🔧 **Done**, shipped with this change.
4. **Fold `NURSE`/`RECEPTIONIST` into the JWT Payload Expansion ticket** (`generateTokens()`), so hospital staff names survive a token refresh, not just the initial login. Currently only `DOCTOR`/`HOSPITAL_ADMIN` are in scope there.
