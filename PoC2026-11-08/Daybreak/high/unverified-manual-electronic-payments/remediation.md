# Remediation — Unverified Manual Electronic Payments

Restrict `recordPayment` to physical CASH capture. Electronic methods must use
their provider-specific verification path with amount/currency/reference
binding. Insurance requires an authenticated adjudication response or a
controlled pending-claim workflow; never set `insuranceVerified` from a method
string. Require fine-grained payment permission and record immutable cashier
audit data. Test fabricated references for every non-cash method and expect
rejection without fulfilment.
