# Sensitive Request-Body Logging — HIGH

The global interceptor logs every request body. Its redaction list covers
password variants and refresh tokens only. Verification codes, password-reset
codes, payment OTPs, national IDs, insurance identifiers, symptoms,
prescription files, and clinical content remain in plaintext logs.

**Affected code:** `logging.interceptor.ts:14-69`.

Anyone with log-platform access can reuse active credentials/codes and obtain
large volumes of regulated financial and health data. This is broader than the
original email-service temporary-password logging finding.

**Status:** Static-confirmed.
