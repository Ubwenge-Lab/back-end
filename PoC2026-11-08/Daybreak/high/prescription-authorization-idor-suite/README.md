# Prescription Authorization IDOR Suite — HIGH

Several prescription routes omit object authorization:

- `GET /prescriptions/:id` has no role metadata and `findById()` has no owner check.
- status updates do not receive caller identity or enforce pharmacy/branch scope.
- patient-by-MRN trusts a caller-supplied hospital and is allowed to patients.
- external dispatch receives no caller and can dispatch another hospital's prescription.

**Affected code:** `prescriptions.controller.ts:60-113` and
`prescriptions.service.ts:417-545, 991-1108`.

Attackers can expose patient email and prescription details, alter clinical
approval status, or create external pharmacy orders across tenants.

**Status:** Static-confirmed.
