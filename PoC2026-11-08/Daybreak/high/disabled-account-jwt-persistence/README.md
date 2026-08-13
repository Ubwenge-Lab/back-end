# Disabled Account JWT Persistence — HIGH

Login checks `user.isActive`, but access-token and refresh-token strategies
only check that the user exists. `refreshTokens()` also ignores activation and
staff status. Existing tokens therefore remain usable after deactivation and
can mint new sessions.

**Affected code:** `jwt.strategy.ts:29-43`, `jwt-refresh.strategy.ts:29-49`,
and `auth.service.ts:1024-1048`.

An isolated validation test returned an accepted principal for a database user
whose `isActive` value was `false`.

**Status:** Confirmed with a strategy harness on 2026-08-12.
