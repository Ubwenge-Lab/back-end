# Remediation — Disabled Account JWT Persistence

Centralize principal validation and invoke it from both JWT strategies and
refresh. Require active user, active staff record, approved branch, and
approved organization as applicable. On deactivation, clear the refresh-token
hash and increment a `tokenVersion`; include that version in JWTs and compare
on every request. For immediate revocation, use short access-token lifetimes or
a revocation cache. Add tests proving old access and refresh tokens fail after
each deactivation/status transition.
