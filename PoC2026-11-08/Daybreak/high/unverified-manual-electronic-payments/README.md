# Unverified Manual Electronic Payments — HIGH

`recordPayment()` allows cashier/pharmacist/manager staff to mark mobile-money,
card, or insurance payments `COMPLETED` based solely on caller-supplied fields.
No provider or insurer is contacted; insurance is marked verified whenever the
method string is `INSURANCE`.

**Affected code:** `payments.service.ts:604-735`.

A compromised or malicious staff account can fabricate electronic receipts,
references, and insurance settlement, then trigger fulfilment. Branch scope is
checked, but payment authenticity is not.

**Status:** Static-confirmed.
