# Remediation — Payment Ownership Bypass

## Priority: P0

### 1. Enforce ownership in every payment method
Pass the authenticated user into the service and check it against the order:

```typescript
// payments.controller.ts
initiatePayment(@Req() req, @Body() dto) {
  return this.paymentsService.initiatePayment(req.user.sub, dto);
}

// payments.service.ts
async initiatePayment(userId: string, dto: InitiatePaymentDto) {
  const order = await this.prisma.order.findUnique({
    where: { id: dto.orderId },
    include: { patient: { include: { user: true } } },
  });
  if (order.patient.userId !== userId) {
    throw new ForbiddenException('Order does not belong to you');
  }
  ...
}
```

Apply the same to `verifyPayment(paymentId)` and `validateOTP(paymentId)` —
resolve the payment's `order.patient.userId` and compare.

### 2. Add a test that locks this in
Write a regression test: patient A initiates payment on patient B's order →
expect 403. Run it in CI.

### 3. Audit the rest of the payment surface
- `GET /api/payments/verify/:orderId` (manualVerifyByOrderId) — add BOTH
  branch ownership AND role checks (see `cross-branch-manual-verify-bypass`
  pack).
- `GET /api/payments/cashier/recent` — scope to the caller's branch.
- `GET /api/payments/:paymentId/receipt` — already branch-scoped, but verify
  staff vs cashier vs manager are all correctly constrained.

### 4. Generalize: adopt a tenant/ownership pattern
Add a reusable `OwnershipGuard` or `@Owns('orderId')` parameter decorator and
apply it to every resource-scoped endpoint (orders, payments, prescriptions,
appointments, invoices). This prevents this whole class of bug.

### Acceptance criteria
- [ ] Alice → Bob's order returns 403
- [ ] Regression test exists and passes in CI
- [ ] All payment methods resolve ownership server-side
