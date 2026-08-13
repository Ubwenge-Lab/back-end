# Unrelated Prescription Authorization — HIGH

For prescription-only medication, order creation checks only that some
approved prescription belongs to the patient. It never verifies that the
ordered medication, quantity, dose, validity period, or remaining fills appear
on that prescription.

**Affected code:** `orders.service.ts:50-63` and `108-113`.

A patient can reuse an approved prescription for one drug to purchase a
different controlled drug. A pharmacy-status IDOR can also make an unrelated
uploaded prescription approved, compounding the bypass.

**Status:** Static-confirmed.
