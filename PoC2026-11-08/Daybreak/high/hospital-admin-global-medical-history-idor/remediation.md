# Remediation — Hospital Admin Global Medical-History IDOR

Resolve the administrator's hospital from the authenticated user. Require an
active `HospitalPatientRegistration` for that hospital and scope every nested
query to records the hospital is authorized to see. Do not treat administrative
role as global clinical consent; reserve global access for a separately audited
break-glass workflow. Cap pagination and record purpose, tenant, and actor in
the audit log. Add cross-hospital MRN/UUID tests that return 404/403.
