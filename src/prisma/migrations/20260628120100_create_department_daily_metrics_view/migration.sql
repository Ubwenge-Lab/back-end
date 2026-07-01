-- Migration: create_department_daily_metrics_view

CREATE MATERIALIZED VIEW mv_department_daily_metrics AS
SELECT
    a."hospitalId" AS hospital_id,
    d.specialization AS department,
    date_trunc('day', a.date) AS metric_date,
    COUNT(DISTINCT a."patientId") AS patient_throughput,
    COUNT(a.id) AS consultation_count,
    COALESCE(SUM(hi."totalAmount"), 0) AS total_revenue,
    AVG(EXTRACT(EPOCH FROM (tv."createdAt" - a.date)) / 60) AS avg_wait_minutes_approx
FROM "appointments" a
         JOIN "doctors" d ON d.id = a."doctorId"
         LEFT JOIN "hospital_invoices" hi ON hi."appointmentId" = a.id
         LEFT JOIN "triagevitals" tv ON tv."appointmentId" = a.id
WHERE a.status = 'COMPLETED'
GROUP BY a."hospitalId", d.specialization, date_trunc('day', a.date);

CREATE UNIQUE INDEX mv_department_daily_metrics_unique_idx
    ON mv_department_daily_metrics (hospital_id, department, metric_date);