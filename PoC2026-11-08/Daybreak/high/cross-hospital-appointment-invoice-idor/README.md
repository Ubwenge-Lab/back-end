# Cross-Hospital Appointment and Invoice IDOR — HIGH

`AppointmentsService.findOne()` returns any appointment immediately for every
`HOSPITAL_ADMIN`. `InvoicesService.findOne()` similarly returns any invoice to
any hospital admin or receptionist. Neither path verifies the caller's
hospital.

**Affected code:** `appointments.service.ts:229-252` and
`invoices.service.ts:83-106`.

Knowing a record UUID exposes another hospital's patient identity, clinical
encounter, billing items, and related metadata. The invoice pay path also has a
broken receptionist lookup that does not establish proper tenant scope.

**Status:** Static-confirmed.
