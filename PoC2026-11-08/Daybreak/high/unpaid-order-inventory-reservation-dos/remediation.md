# Remediation — Unpaid Order Inventory Reservation DoS

Create a short-lived reservation with `expiresAt`, then release it through an
idempotent worker if payment is not confirmed. Prefer reserving inventory and
order creation in one transaction, while fulfilment requires a paid state.
Apply per-patient quantity/open-order limits and require staff acceptance for
large CASH reservations. When provider initiation fails, immediately cancel
the new order and release its reservation. Test expiry, provider failure, and
concurrent payment/expiry races.
