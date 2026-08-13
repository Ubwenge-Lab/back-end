# Remediation — Prescription Verification and Refill Race

Require the signed QR payload; remove bare-ID verification or restrict it to a
separate authenticated lookup that does not consume a refill. Compare hashes
with `timingSafeEqual`, bind the signature to issuer, patient, medications,
expiry, and a random identifier, and rotate a dedicated prescription secret.
Consume a refill using a conditional atomic update where
`refillsRemaining > 0`, requiring one affected row. Record pharmacy, branch,
actor, and dispense event. Test missing/invalid hashes and concurrent scans.
