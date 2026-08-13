# Daybreak Security Findings — 2026-08-13

This pack documents vulnerabilities found after reviewing the original
`PoC2026-11-08` collection. Existing findings are not duplicated here.

## Inventory

| Severity | Count |
|---|---:|
| Critical | 4 |
| High | 17 |
| Medium | 4 |
| Low | 1 |
| **Total** | **26** |

Every finding contains:

- `README.md` — vulnerability, affected code, impact, and evidence.
- `exploit.sh` — parameterised reproduction or source-level proof.
- `remediation.md` — recommended patch and regression criteria.

## Safety

The PoCs are for an authorized test environment. Several mutate orders,
payments, inventory, prescriptions, or clinical records. Use disposable test
data and do not point them at production without an approved test window.
