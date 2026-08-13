# Remediation — Negative Stock-Transfer Quantity

Add `@IsInt()` and `@Min(1)` to every transfer item and `@ArrayMinSize(1)` to
the item array. Repeat the `quantity > 0` invariant in the service and database
where practical. Replace the unconditional update with a conditional
`updateMany({where:{id, quantity:{gte: requested}}})` and require count `1`.

Tests must reject negative, zero, fractional, NaN, and empty-item transfers and
verify neither stock nor transfer rows change.
