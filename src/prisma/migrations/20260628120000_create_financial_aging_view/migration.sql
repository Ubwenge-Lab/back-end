-- Migration: create_financial_aging_view

CREATE MATERIALIZED VIEW mv_financial_aging AS
SELECT
    hi."hospitalId" AS hospital_id,
    CASE
        WHEN now() - ic."createdAt" <= interval '30 days' THEN '0-30'
    WHEN now() - ic."createdAt" <= interval '60 days' THEN '31-60'
    WHEN now() - ic."createdAt" <= interval '90 days' THEN '61-90'
    ELSE '90+'
END AS aging_bucket,
  COUNT(*) AS claim_count,
  SUM(ic."claimAmount") AS total_claim_amount,
  SUM(ic."settledAmount") AS total_settled_amount,
  SUM(ic."claimAmount" - ic."settledAmount") AS total_outstanding
FROM "insurance_claims" ic
JOIN "hospital_invoices" hi ON hi.id = ic."invoiceId"
WHERE ic.status != 'PAID'
GROUP BY hi."hospitalId", aging_bucket;

CREATE UNIQUE INDEX mv_financial_aging_unique_idx
    ON mv_financial_aging (hospital_id, aging_bucket);