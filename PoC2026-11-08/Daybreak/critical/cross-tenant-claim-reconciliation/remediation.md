# Remediation — Cross-Tenant Claim Reconciliation

## Priority: P0

Pass `req.user` to `reconcile()`. Resolve the caller's hospital server-side and
query the claim with an ownership predicate through its invoice:

```typescript
where: { id: claimId, invoice: { hospitalId: callerHospitalId } }
```

Only `SUPER_ADMIN` may omit that predicate. Return 404 for out-of-scope IDs to
avoid confirming their existence. Record reconciler user, timestamp, original
status, settlement reference, and an immutable audit event.

Regression test Hospital A against Hospital B's claim and assert 404/403 plus
unchanged claim and invoice rows.
