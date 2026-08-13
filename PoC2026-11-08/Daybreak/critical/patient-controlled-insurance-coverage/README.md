# Patient-Controlled Insurance Coverage — CRITICAL

## Vulnerability summary

A patient may write `insuranceCoverage` directly through `PUT
/api/patients/profile`. The value has no `0..100` bound and is spread directly
into the patient record. Order and hospital billing subsequently trust it.

**Affected code:** `update-patient.dto.ts:52-55`,
`patients.service.ts:189-198`, `orders.service.ts:161-197`, and
`appointments.service.ts:330-395`.

## Impact

Setting coverage above 100 produces negative patient balances. A service-level
test using 250% coverage on a RWF 1,000 order calculated `patientPayment =
-1500`. The same value contaminates hospital invoice and claim calculations.

## Attack chain

Patient changes profile coverage → places an insured order → server calculates
an overpayment/negative balance → inventory and financial records are created
using attacker-controlled insurance data.

**Status:** Confirmed with an isolated service harness on 2026-08-12.
