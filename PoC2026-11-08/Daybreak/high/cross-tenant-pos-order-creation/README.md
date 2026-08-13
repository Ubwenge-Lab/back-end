# Cross-Tenant POS Order Creation — HIGH

When the caller is not a patient, order creation accepts any client-supplied
`patientId`. It never verifies that staff belong to the requested pharmacy or
branch. Medication is checked against `pharmacyId`, but not the selected branch,
and inventory is immediately decremented.

**Affected code:** `orders.service.ts:32-139`.

Branch A staff can create orders on arbitrary patients and reserve/deplete
Branch B or another pharmacy's stock. Broad route roles and the unused
permission guard amplify the issue.

**Status:** Static-confirmed.
