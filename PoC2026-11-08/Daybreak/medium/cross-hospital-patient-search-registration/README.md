# Cross-Hospital Patient Search and Registration — MEDIUM

Hospital patient search ignores both the URL hospital and caller, returning a
global patient plus email from phone/national ID. Registration accepts an
arbitrary URL hospital ID and links the selected patient without proving the
caller belongs to that hospital.

**Affected code:** `hospitals.controller.ts:90-111` and
`hospitals.service.ts:37-89`.

Hospital A staff can search global identities and create registrations at
Hospital B. This exposes personal data and corrupts medical-record routing.

**Status:** Static-confirmed.
