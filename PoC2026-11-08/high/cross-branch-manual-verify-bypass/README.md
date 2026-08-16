# Cross-Branch Manual Verify Bypass — HIGH (Static-Confirmed)

## Vulnerability Summary

`GET /api/payments/verify/:orderId` (`manualVerifyByOrderId()`) lets **any
cashier/pharmacist mark any order in any branch as paid**. Unlike
`recordPayment()`, it performs **no branch-ownership check**. The function
also auto-completes CASH payments with zero verification.

**Status:** ⚠️ STATIC-CONFIRMED (code review) — 2026-08-11
**Severity:** High (internal fraud / cross-branch financial manipulation)

---

## 1. Vulnerability Identification Process

### 1.1 Static review

`src/payments/payments.service.ts:314-399`:

```typescript
async manualVerifyByOrderId(orderId: string, user: any) {
  const payment = await this.prisma.payment.findUnique({
    where: { orderId: orderId },          // ← ANY branch
    include: { order: { include: { patient: true, pharmacy: true } } },
  });
  ...
  if (payment.order.paymentMethod === 'CASH') {
    // Marks COMPLETED + handlePaymentSuccess() with NO verification at all
  }
  ...
}
```

Contrast with `recordPayment()` (`payments.service.ts:653-658`) which DOES
enforce branch ownership:

```typescript
const branch = await this.resolveBranchForStaff(staffUserId);
if (!branch || branch.id !== order.branchId) {
  throw new BadRequestException("Order does not belong to ... your branch");
}
```

### 1.2 Why it matters

- A cashier at Branch A can verify (and thereby fulfill) an order from
  Branch B — cross-branch fraud or accidental fulfillment.
- CASH payments are auto-completed: no amount check, no reference check.
- Controller role gate (`CASHIER/PHARMACIST/SUPER_ADMIN`) does not scope the
  order to the caller's branch.

### 1.3 Dynamic note

On the live instance all seed orders belong to the same branch, so a clean
cross-branch exploit was not demonstrated end-to-end; the missing guard is
confirmed directly in the code path (no branch filter anywhere in
`manualVerifyByOrderId`).

---

## 2. Attack Chain

```
Disgruntled / compromised cashier or pharmacist
  → GET /api/payments/verify/<any-order-uuid>
  → order marked paid (esp. CASH) → handlePaymentSuccess() → fulfillment
  → collusion: "customer" picks up, no money recorded at this branch
```

---

## 3. Evidence (2026-08-11)

```
Code path contains NO branch-ownership check (verified by source diff with
recordPayment(), which does).
```

---

## 4. Files

| File | Purpose |
|---|---|
| `exploit.sh` | Manual-verify PoC against any order (parameterised) |
| `remediation.md` | Step-by-step remediation |
