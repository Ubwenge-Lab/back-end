# Stock-Transfer State-Machine Bypass — HIGH

Either the sending or receiving manager may submit any `TransferStatus` while
a transfer is not terminal. There is no allowed-transition table or
party-specific authority. A sender can immediately mark its own transfer
`COMPLETED`; a receiver can reject/advance it in inappropriate states.

**Affected code:** `stock-transfers.service.ts:121-234`.

Completing credits the destination, while rejecting restores the sender.
Improper transitions undermine custody, inventory auditability, and separation
of duties.

**Status:** Static-confirmed.
