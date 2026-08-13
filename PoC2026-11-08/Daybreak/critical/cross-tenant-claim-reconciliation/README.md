# Cross-Tenant Claim Reconciliation — CRITICAL

## Vulnerability summary

`PATCH /api/admin/claims/:claimId/reconcile` permits hospital administrators,
but the controller does not pass the authenticated user to the service. The
service loads and settles a claim solely by its ID.

**Affected code:** `claims.controller.ts:34-40` and
`claims.service.ts:74-139`.

## Impact

A Hospital A administrator who obtains a Hospital B claim ID can mark that
claim and its invoice paid or partially paid with an arbitrary settlement
amount. This corrupts insurer reconciliation and hospital revenue records.

The list endpoint is scoped, but object authorization on the write endpoint is
absent; hiding IDs is not an authorization control.

**Status:** Static-confirmed by tracing the entire reconciliation path.
