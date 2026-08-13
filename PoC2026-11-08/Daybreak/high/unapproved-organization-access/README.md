# Unapproved Organization Access — HIGH

Verified pharmacy and hospital-admin accounts receive JWTs even when the
organization status is `PENDING` or `REJECTED`; login merely returns an
informational message. Most authorization guards check only the role.

**Affected code:** `auth.service.ts:105-175` plus role-only controllers.

Pending/rejected organizations can reach endpoints that do not repeat a
service-level approval check, including sensitive hospital onboarding,
patient, inventory, and profile operations. Approval is therefore not a
reliable security boundary.

**Status:** Static-confirmed.
