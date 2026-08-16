# Remediation — Cross-Branch Manual Verify Bypass

## Priority: P1

### 1. Add branch ownership to manualVerifyByOrderId
Mirror `recordPayment()`:

```typescript
async manualVerifyByOrderId(orderId: string, user: any) {
  const payment = await this.prisma.payment.findUnique({
    where: { orderId }, include: { order: true },
  });
  const branch = await this.resolveBranchForStaff(user.sub);
  if (!branch || branch.id !== payment.order.branchId) {
    throw new ForbiddenException('Order does not belong to your branch');
  }
  ...
}
```

### 2. Remove the CASH auto-complete shortcut
- CASH payments must require an explicit amount/reference capture
  (`recordPayment`) — never silently COMPLETED from a verify call.
- Add a minimum check: cashier must confirm amount received ≥ order total.

### 3. Add regression tests
- Cashier from branch A verifying an order from branch B → 403.
- CASH manual verify without a recorded reference → 400.

### 4. Audit all branch-scoped operations
- `GET /api/payments/cashier/recent` — scope to caller's branch.
- `GET /api/payments/:paymentId/receipt` — already checks branch, keep.
- Staff `findByBranch`/`findByPharmacy` helpers — verify they derive scope
  from the authenticated user, never from request params.

### Acceptance criteria
- [ ] Cross-branch verify returns 403
- [ ] CASH payments cannot be completed via the verify endpoint
- [ ] Regression tests cover both cases
