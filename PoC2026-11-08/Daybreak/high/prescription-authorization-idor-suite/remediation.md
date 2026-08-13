# Remediation — Prescription Authorization IDOR Suite

Pass the authenticated principal to every prescription service method. Build a
single policy that authorizes patient ownership, assigned treating doctor, or
active staff membership in the prescription's hospital/pharmacy branch. Apply
scope in database queries, not after unrestricted fetches. Remove `PATIENT`
from MRN lookup and derive hospital from staff identity. Require a valid state
transition and audit status/dispatch changes. Add a caller/resource matrix test
covering every prescription endpoint.
