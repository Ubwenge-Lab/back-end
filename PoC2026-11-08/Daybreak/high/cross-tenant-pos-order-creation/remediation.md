# Remediation — Cross-Tenant POS Order Creation

Resolve staff and branch from `req.user.sub`; do not accept staff scope from
the body. Require `dto.branchId === staff.branchId`, derive pharmacy from that
branch, and ensure every medication belongs to both. Authorize patient access
according to the business relationship and minimum necessary data. Require
`PROCESS_PAYMENTS`/order permissions. Test staff from Branch A against Branch B
patient, medication, branch, and pharmacy identifiers.
