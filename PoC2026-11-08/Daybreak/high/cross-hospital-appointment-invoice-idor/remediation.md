# Remediation — Cross-Hospital Appointment and Invoice IDOR

Resolve the caller's hospital from its user/staff relationship and include
`hospitalId` in the appointment/invoice query itself. Super-admin access should
be an explicit audited exception. Fix receptionist resolution through
`HospitalStaff`, not `Hospital.userId`. Return 404 for out-of-scope objects.
Add read and payment regression tests for Hospital A admin/receptionist against
Hospital B records.
