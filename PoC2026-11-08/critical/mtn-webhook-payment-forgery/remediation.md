# Remediation — MTN Webhook Payment Forgery

## Priority: P0

### 1. Verify the webhook signature (mandatory)
MTN MoMo webhooks must be authenticated. Depending on the MTN API version:

1. **HMAC-SHA256 signature verification** — compute
   `HMAC_SHA256(webhook_secret, raw_body)` and compare against the
   signature header (constant-time comparison). Reject on mismatch.
2. Store `MTN_WEBHOOK_SECRET` in the secrets manager — never in the repo.
3. Verify the **sender IP / TLS client cert** if MTN provides a fixed egress
   range.
4. Do **server-to-server verification** of the transaction with the MTN API
   (`GET /collection/v1_0/requesttopay/<reference>`) before marking anything
   paid. Never trust the callback alone.

### 2. Tie the payload to a real transaction
1. The `financialTransactionId` must be resolved and confirmed against the
   provider. Reject unknown/cached transaction IDs.
2. Match `amount` and `currency` **exactly** against the order (currently the
   check allows `>=`, which also permits overpayments to be faked).
3. Reject callbacks for orders whose payment already completed *and* rotate
   the transaction reference on retry (no replay).

### 3. Rate-limit + monitor the webhook endpoint
1. Apply a high but strict rate limit per source IP.
2. Alert on: payment status flips without a matching provider transaction,
   repeated failed signature checks, or webhook payloads whose
   `financialTransactionId` was already seen.

### 4. Defense in depth
1. Do not auto-fulfill on webhook alone — require the order to also pass
   business checks (pharmacy approved, stock verified, etc.).
2. Add `X-Webhook-Secret` header validation in addition to body signature.
3. Keep the endpoint `@Public()` **only if** signature verification is
   correctly implemented; otherwise put it behind mutual TLS.

### Acceptance criteria
- [ ] A forged payload (as in `exploit.sh`) is rejected with 401/403
- [ ] A replayed `financialTransactionId` is rejected
- [ ] Payment status only flips after provider-side confirmation
- [ ] Monitoring alert fires on signature failures
