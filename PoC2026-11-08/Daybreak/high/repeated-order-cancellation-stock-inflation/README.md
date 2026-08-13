# Repeated Order Cancellation Stock Inflation — HIGH

Patient cancellation blocks several fulfilment states but not `CANCELLED`.
Each request writes `CANCELLED` again and restores every order item again.

**Affected code:** `orders.service.ts:472-513`.

An owner may replay the same cancellation to manufacture unlimited stock. An
isolated harness called the endpoint twice for a seven-unit order and observed
two restoration calls (14 artificial units).

**Status:** Confirmed with a service harness on 2026-08-12.
