# Public Telemedicine Telemetry Forgery — MEDIUM

`POST /api/appointments/:id/consultation-session` is explicitly public and
trusts client-supplied `userId`, role, and JOIN/LEAVE action. It stores the event
without checking participant identity or appointment membership. Forged doctor
LEAVE events can increment `telemedicineDuration` from attacker-created JOINs.

**Affected code:** `appointments.controller.ts:226-235` and
`appointments.service.ts:727-777`.

This corrupts audit trails and any billing/analytics based on consultation
duration. It is distinct from the original public room-data disclosure.

**Status:** Static-confirmed.
