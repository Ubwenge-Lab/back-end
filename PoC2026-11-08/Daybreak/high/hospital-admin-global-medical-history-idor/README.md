# Hospital Admin Global Medical-History IDOR — HIGH

The master-history service gives every `HOSPITAL_ADMIN` unconditional ADMIN
access after resolving a patient by global MRN, hospital MRN, or UUID. It does
not verify that the patient is registered at the caller's hospital.

**Affected code:** `patients.service.ts:259-407`.

A Hospital A admin can retrieve a patient's appointments, prescriptions,
triage vitals, insurance details, and invoices across all hospitals. Doctors
have treatment/consent checks, making the hospital-admin bypass especially
inconsistent.

**Status:** Static-confirmed.
