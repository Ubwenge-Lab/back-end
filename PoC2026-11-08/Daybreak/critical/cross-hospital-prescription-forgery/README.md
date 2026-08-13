# Cross-Hospital Prescription Forgery — CRITICAL

## Vulnerability summary

The doctor-only hospital prescription route accepts client-selected
`patientId`, `hospitalId`, and `appointmentId`. The service verifies that each
object exists but never verifies that the doctor, appointment, patient, and
hospital belong to the same encounter.

**Affected code:** `hospital-issue-prescription.dto.ts:41-67` and
`prescriptions.service.ts:758-967`.

## Impact

A doctor from Hospital A can forge a prescription for a patient/appointment at
Hospital B, decrement Hospital B inventory, create invoice items, and change
clinical records. This crosses both patient and organization boundaries.

Required missing invariants include `doctor.hospitalId === hospitalId`,
`appointment.doctorId === doctor.id`, `appointment.patientId === patientId`,
and `appointment.hospitalId === hospitalId`.

**Status:** Static-confirmed; the transaction contains no caller-bound scope.
