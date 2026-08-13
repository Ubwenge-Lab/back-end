# Remediation — Repeated Order Cancellation Stock Inflation

Make cancellation an atomic state transition:

```typescript
updateMany({ where: { id, patientId, status: { in: cancellable } },
             data: { status: 'CANCELLED' } })
```

Continue only when one row changed. Restore inventory within the same database
transaction and maintain a unique inventory-ledger entry keyed by
`ORDER_CANCEL:<orderId>` for idempotency. Reject already-cancelled requests.
Test sequential and concurrent replay; stock must be restored exactly once.
