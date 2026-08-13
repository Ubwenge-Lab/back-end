# Negative Stock-Transfer Quantity — HIGH

`StockTransferItemDto.quantity` has `@IsNumber()` but no positive minimum.
During transfer creation, Prisma executes `decrement: item.quantity`; a
negative quantity therefore increases the sender's stock. The availability
check also always passes for a negative value.

**Affected code:** `create-stock-transfer.dto.ts:12-21` and
`stock-transfers.service.ts:75-110`.

Validation was tested directly: a quantity of `-100` produced zero validation
errors. A branch manager can forge arbitrary stock and create nonsensical
negative transfer items.

**Status:** Validation and arithmetic confirmed locally on 2026-08-12.
