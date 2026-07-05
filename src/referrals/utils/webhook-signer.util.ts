// src/referrals/utils/webhook-signer.util.ts
import { createHmac, timingSafeEqual } from 'crypto';

export function signReferralPayload(
  secret: string,
  timestamp: string,
  payload: Record<string, unknown>,
): string {
  const canonicalPayload = `${timestamp}.${JSON.stringify(payload)}`;
  return createHmac('sha256', secret).update(canonicalPayload).digest('hex');
}

// For whoever builds the *receiving* side (could be a different hospital's
// team, or you later) — confirms a signature actually matches the secret
// without leaking timing information about a partial match.
export function verifyReferralWebhookSignature(
  secret: string,
  timestamp: string,
  payload: Record<string, unknown>,
  signature: string,
): boolean {
  const expected = signReferralPayload(secret, timestamp, payload);
  const expectedBuf = Buffer.from(expected, 'hex');
  const givenBuf = Buffer.from(signature, 'hex');
  if (expectedBuf.length !== givenBuf.length) return false;
  return timingSafeEqual(expectedBuf, givenBuf);
}