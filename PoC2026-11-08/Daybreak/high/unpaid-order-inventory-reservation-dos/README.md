# Unpaid Order Inventory Reservation DoS — HIGH

Order creation decrements stock before payment and commits a `PENDING` order.
There is no payment deadline or job that cancels unpaid orders and releases
stock. CASH orders require no provider interaction at all.

**Affected code:** `orders.service.ts:73-215` and `662-687`.

One verified patient can order the entire available quantity using CASH and
never pay, making medication appear out of stock indefinitely. Failed checkout
provider calls also leave the already-created reservation behind.

**Status:** Static-confirmed from the committed transaction and absence of an
expiry/release path.
