# Remediation — Provider Transaction Substitution

## Priority: P0

On every provider verification, require all of the following:

- provider status is successful;
- amount equals the locally expected amount using integer minor units;
- currency is exactly the configured order currency;
- `tx_ref` equals a random, server-generated reference stored before charge;
- provider customer identity matches the payer;
- transaction ID has not settled another payment.

Perform the comparison and transition in one database transaction with a
conditional update from `PENDING` to `COMPLETED`. Reject missing fields rather
than treating them as matches. Apply the same helper to webhook, OTP, manual,
and direct verification paths.

Regression tests must reject amount, currency, customer, and reference
mismatches individually.
