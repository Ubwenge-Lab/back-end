# Cross-Branch Recent Payments Exposure — HIGH

`GET /api/payments/cashier/recent` is available to any cashier/pharmacist and
calls a service with no user context. It returns the latest 50 completed
payments platform-wide, including nested patient records.

**Affected code:** `payments.controller.ts:62-65` and
`payments.service.ts:499-515`.

A staff member in one branch can monitor other branches' financial activity
and patient personal/insurance information.

**Status:** Static-confirmed.
