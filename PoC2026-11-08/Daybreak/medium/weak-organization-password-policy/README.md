# Weak Organization Password Policy — MEDIUM

Patient registration enforces password complexity, but pharmacy and hospital
registration DTOs apply only `@IsString()` and `@IsNotEmpty()`. A one-character
password is accepted and stored for a future privileged organization admin.

**Affected code:** `register-pharmacy.dto.ts:20-28` and
`register-hospital.dto.ts:16-24`.

Direct class-validator tests confirmed that password `x` produces no password
validation error for either DTO. Weak privileged credentials increase account
takeover risk despite login throttling.

**Status:** Validation-confirmed on 2026-08-12.
