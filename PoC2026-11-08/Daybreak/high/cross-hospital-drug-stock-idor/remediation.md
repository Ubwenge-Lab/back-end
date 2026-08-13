# Remediation — Cross-Hospital Drug-Stock IDOR

Pass the authenticated user to both service methods. Resolve the caller's
hospital through `Hospital.userId` or active `HospitalStaff`, then require it
to equal the URL hospital. Remove pharmacy-branch `PHARMACIST` from hospital
routes unless hospital pharmacists have a distinct identity and relationship.
Prefer routes such as `/hospitals/me/drug-stock` that derive tenant scope.
Test Hospital A and pharmacy staff against Hospital B read and write requests.
