# Remediation — Patient-Controlled Insurance Coverage

## Priority: P0

1. Remove `insuranceCoverage` from `UpdatePatientDto`; patients must never set
   an adjudicated coverage percentage.
2. Store self-declared policy details separately from verified coverage.
3. Make verification an insurer/admin-only workflow and record issuer,
   timestamp, evidence, and expiry.
4. Enforce `@Min(0)` and `@Max(100)` as defense in depth.
5. Clamp billing invariants: covered amount must be between zero and total;
   patient payment must never be negative.
6. Recalculate server-side at checkout rather than trusting the patient row.

## Regression criteria

- A patient cannot submit `insuranceCoverage`.
- Coverage outside `0..100` is rejected in every internal path.
- A RWF 1,000 order can never produce a negative payable amount.
