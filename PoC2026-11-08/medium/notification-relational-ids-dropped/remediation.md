# Remediation — Notification Relational IDs Dropped

## Priority: P2

### 1. Persist all relational IDs
```typescript
async create(data: any) {
  const notification = await this.prisma.notification.create({
    data: {
      userId: data.userId ?? null,
      patientId: data.patientId ?? null,
      pharmacyId: data.pharmacyId ?? null,
      orderId: data.orderId ?? null,
      type: data.type,
      title: data.title,
      message: data.message,
    },
  });
  ...
}
```

### 2. Deliver by role-scoped routing
Resolve recipients server-side from the relational IDs:
- `pharmacyId` → pharmacy owner user(s) (and branch managers).
- `orderId` → the order's patient + pharmacy.
- Then emit `sendNotificationToUser()` to each resolved `userId`.

This also removes the current "only when `userId` is set" gap.

### 3. Add a DB constraint test
- Regression test: `create({patientId, pharmacyId, orderId})` → assert all
  three columns are persisted.

### 4. Operational benefit
- With correct routing, the pharmacy will actually receive payment/order
  alerts — closing the security-blindness side of this bug.

### Acceptance criteria
- [ ] `patientId`/`pharmacyId`/`orderId` persist on notifications
- [ ] Pharmacy-scoped notifications reach the right users over WS
- [ ] Regression tests assert relational persistence
