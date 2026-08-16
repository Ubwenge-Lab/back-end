# Remediation — Flutterwave Mock-Mode Risk

## Priority: P2

### 1. Make mock mode explicit and safe
1. Replace the substring sniff with an explicit env flag:
   ```typescript
   const MOCK_PAYMENTS = process.env.FLUTTERWAVE_TEST_MODE === 'true'
     && process.env.NODE_ENV !== 'production';
   ```
   In production, `FLUTTERWAVE_TEST_MODE` must be `false` and the app must
   **fail to boot** if the keys are missing or template-like.
2. Never derive behavior from the key's contents.

### 2. Fail closed on missing/invalid keys
In `onModuleInit()`, throw (not just log) when keys are missing or contain
`your-` placeholders in production.

### 3. Enforce provider verification server-side
- `verifyPayment()` must always call the provider API and check the response
  against the order (`amount`, `currency`, `status`), even in test mode.
- Log a red-flag alert when a verification returns "successful" for a
  transaction id that was never created by the app.

### 4. Tests
- Unit: with template key in production → boot fails.
- Integration: fake transaction id → rejected (no mock bypass).

### Acceptance criteria
- [ ] Production refuses to start with template keys
- [ ] Fake transaction ids cannot verify a payment
- [ ] Mock mode is impossible in `NODE_ENV=production`
