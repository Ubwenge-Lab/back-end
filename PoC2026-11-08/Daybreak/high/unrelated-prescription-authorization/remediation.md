# Remediation — Unrelated Prescription Authorization

Model prescribed items structurally and match each order item to an active,
signed prescription item by registry/medication identity. Enforce quantity,
expiry, refill balance, patient, allowed substitutions, and dispense history.
Reserve/consume prescribed quantity atomically with the order. Do not authorize
from free-text names or a parent `APPROVED` flag alone. Add negative tests for
different drug, excessive quantity, expired prescription, and exhausted fill.
