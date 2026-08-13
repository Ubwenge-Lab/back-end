# Provider Transaction Substitution — CRITICAL

## Vulnerability summary

`verifyPayment()` treats any provider transaction whose status is
`successful` as proof that the selected local payment was paid. It does not
compare amount, currency, customer, provider reference, or `tx_ref` to the
local order. `manualVerifyByOrderId()` repeats the defect.

**Affected code:** `payments.service.ts:153-192` and `314-382`.

## Impact

An attacker can use an unused successful low-value Flutterwave transaction to
complete a high-value order. In the isolated harness, a successful RWF 1
provider result completed a local RWF 100,000 payment and triggered order
fulfilment.

This is distinct from the original payment ownership bypass: even after
ownership is fixed, a transaction must still be cryptographically and
semantically bound to the payment it settles.

**Status:** Confirmed with a mocked provider response on 2026-08-12.
