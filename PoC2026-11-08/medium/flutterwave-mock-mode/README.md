# Flutterwave Mock-Mode / Payment-Integrity Risk — MEDIUM (Static-Confirmed)

## Vulnerability Summary

The Flutterwave service enters **mock mode** whenever the configured secret
key contains the substring `your-secret-key`. In mock mode, `verifyPayment()`
returns `status: 'successful'` for **any** transaction ID. If production ever
runs with template/test keys (the committed `.env.example` literally contains
`FLWSECK_TEST-your-secret-key`), **every payment is accepted as successful
without any real charge**.

**Status:** ⚠️ STATIC-CONFIRMED (code review) — 2026-08-11
**Severity:** Medium (fragile payment integrity — catastrophic if triggered)

---

## 1. Vulnerability Identification Process

### 1.1 Static review

`src/payments/flutterwave.service.ts` — the mock branch is everywhere:

```typescript
// verifyPayment (line ~117)
if (this.secretKey?.includes('your-secret-key')) {
  return { status: 'success', data: { status: 'successful', id: Number(transactionId) || 123456, ... } };
}
```

Same pattern in `initializePayment`, `chargeMobileMoney`,
`validateMobileMoneyOTP`, `chargeCard`, and `refund`.

The committed `.env.example` (public repo) has:

```
FLUTTERWAVE_SECRET_KEY="FLWSECK_TEST-your-secret-key"
```

so a developer who copies the template, or a deploy that misses the real key,
silently activates full mock mode in production.

### 1.2 Why it matters
- `verifyPayment()` is called from `payments.service.verifyPayment()` and
  `manualVerifyByOrderId()` — mock mode makes ANY transaction id verify
  "successful" → order marked paid.
- `chargeMobileMoney` mock returns `flw_ref: mock-flw-ref-<orderId>` → OTP
  validation also succeeds in mock mode.
- This is a landmine: combined with the leaked `.env.example`, a mis-deploy
  = unlimited free orders.

---

## 2. Attack Chain

```
Deploy with FLUTTERWAVE_SECRET_KEY=...your-secret-key (from committed template)
  → verifyPayment() always returns successful
  → POST /payments/verify {paymentId, transactionId: <anything>}
  → order COMPLETED, stock released — no money ever collected
```

---

## 3. Evidence

```
Source: flutterwave.service.ts — 6 mock branches keyed on the secret string.
Live: the running instance rejected "Invalid authorization key" on initiate,
which indicates real (or differently configured) keys are set today.
```

---

## 4. Files

| File | Purpose |
|---|---|
| `exploit.sh` | Detect mock mode from the live API (parameterised) |
| `remediation.md` | Step-by-step remediation |
