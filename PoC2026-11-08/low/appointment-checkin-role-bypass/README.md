# Appointment Check-in Role Bypass — LOW (Static-Confirmed)

## Vulnerability Summary

`PUT /api/appointments/:id/check-in` has its `@Roles(Role.RECEPTIONIST)`
decorator **commented out**. Any authenticated user (including patients or
cashiers) can flip an appointment from SCHEDULED to ARRIVED.

**Status:** ⚠️ STATIC-CONFIRMED (code review) — 2026-08-11
**Severity:** Low (workflow integrity; requires an authenticated account)

---

## 1. Vulnerability Identification Process

### 1.1 Static review

`src/appointments/appointments.controller.ts:147-148`:

```typescript
@Put(':id/check-in')
// @Roles(Role.RECEPTIONIST)      ← commented out
@HttpCode(HttpStatus.OK)
checkIn(@Req() req: any, @Param('id') appointmentId: string) {
  return this.appointmentsService.checkIn(appointmentId, req.user.sub);
}
```

The controller-level `@UseGuards(JwtAuthGuard, RolesGuard)` still applies,
but `RolesGuard.canActivate()` returns `true` when no `@Roles` metadata
exists — so **any authenticated role** passes.

The service `checkIn()` validates the staff/hospital relationship, so the
practical impact is limited to authorized-hospital members being able to
check in without the receptionist role — an authorization sloppiness rather
than a privilege escalation.

---

## 2. Attack Chain

```
Any authenticated account (e.g. patient at the hospital)
  → PUT /api/appointments/:id/check-in
  → status flips SCHEDULED → ARRIVED (if the service check passes)
  → minor workflow integrity issue
```

---

## 3. Evidence

```
Source: appointments.controller.ts — @Roles commented out.
```

---

## 4. Files

| File | Purpose |
|---|---|
| `exploit.sh` | Check-in as a non-receptionist role (parameterised) |
| `remediation.md` | Step-by-step remediation |
