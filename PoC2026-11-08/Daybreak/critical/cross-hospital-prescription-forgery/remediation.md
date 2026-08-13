# Remediation — Cross-Hospital Prescription Forgery

## Priority: P0

Do not accept patient or hospital identity independently from the encounter.
Load the appointment through a caller-scoped query:

```typescript
where: { id: appointmentId, doctor: { userId: callerId } }
```

Derive `doctorId`, `patientId`, and `hospitalId` exclusively from that result.
Require an allowed active appointment state and ensure no prescription already
exists for the encounter. Perform stock decrement with a checked affected-row
count and keep invoice creation inside the same transaction.

Add cross-hospital regression tests for mismatched doctor, patient, hospital,
and appointment IDs; every case must return 403 without mutations.
