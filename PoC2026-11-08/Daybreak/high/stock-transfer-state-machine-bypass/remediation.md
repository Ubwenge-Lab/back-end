# Remediation — Stock-Transfer State-Machine Bypass

Define an explicit transition matrix and actor:

- sender: create and optionally cancel before shipment;
- receiver: approve/reject pending requests and acknowledge receipt;
- only approved transfers may ship; only shipped transfers may complete.

Use conditional updates that include the expected current status, record actor
and timestamps, and reject no-op transitions. Credit/restore stock once inside
the same serializable transaction. Add tests for every forbidden actor/state
combination and concurrent terminal updates.
