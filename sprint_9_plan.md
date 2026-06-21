# Sprint 9 Plan: Analytics, Statutory MOH Reporting, Audit Logs & Launch Readiness

This sprint plan defines the backend development tasks for **Sprint 9 (Final Hospital Phase Sprint)**, focusing on analytics dashboards, statutory reporting, security audit logging, failover setups, and final integration testing.

It is structured for a team of **7 Backend Developers** (3 Seniors, 4 Interns).

---

## 👑 Senior Backend Tasks (3 Developers)

### 📋 Task 53: Security Audit Log Trail & Column-Level Encryption Compliance
**Story Points:** ~8  
**Role Target:** HIPAA/GDPR Compliance & Cryptography Specialist  
**Assignee:** Senior Developer 1  

#### Description
Build an immutable audit logging system and enforce column-level encryption on high-sensitivity medical data (e.g., patient identity, diagnostic history, HIV status).

#### Detailed Requirements
1. **Immutable Audit Logger:**
   - Create a service wrapper that records every read and write access to clinical tables (`who`, `when`, `what`, `IP address`, `reason`).
2. **Column-Level Field Encryption:**
   - Use AES-256 to encrypt and decrypt sensitive fields (e.g., patient phone, national ID, clinical diagnoses) before writing to/reading from PostgreSQL, keeping encryption keys separate from database servers (using KMS or environment secrets).
3. **Audit Query Interface:**
   - Build a restricted query interface for hospital compliance officers to audit logins and access histories.

#### Acceptance Criteria
- [ ] Database backups do not contain plaintext values of encrypted columns.
- [ ] Audit logs are written asynchronously to prevent bottlenecking patient requests.
- [ ] Non-compliance flags are logged if unauthorized backend roles attempt access.

---

### 📋 Task 54: Operational Analytics, Financial Aging, & BI Dashboards
**Story Points:** ~8  
**Role Target:** Business Intelligence & Query Optimizer  
**Assignee:** Senior Developer 2  

#### Description
Build reporting aggregation queries and endpoints to feed executive dashboards, detailing cash flow, department revenue, inventory valuation, and bed occupancy.

#### Detailed Requirements
1. **Financial Aging Engine:**
   - Query calculations for insurance claims unpaid for 30/60/90 days (`GET /api/reports/financial/aging`).
2. **Department Performance Metrics:**
   - Aggregate daily revenue, patient throughput, average wait times, and consultation counts grouped by department (Pediatrics, Cardiology, etc.).
3. **Optimized Materialized Views:**
   - Setup cron-refreshed PostgreSQL materialized views for dashboard endpoints to avoid querying millions of raw encounters on load.

#### Acceptance Criteria
- [ ] Analytics dashboard queries resolve in under $300\text{ms}$.
- [ ] Materialized views refresh in off-peak hours (midnight) or on a low-priority background thread.

---

### 📋 Task 55: High-Throughput Load Testing, DB Replica Read-Write Splits & Failover
**Story Points:** ~8  
**Role Target:** DevOps, Infrastructure, & Database Administrator  
**Assignee:** Senior Developer 3  

#### Description
Configure backend database connection pooling to route read queries to read-replicas, write queries to primary database nodes, and perform crash failover testing under stress load.

#### Detailed Requirements
1. **Prisma Read-Write Splitting:**
   - Setup a NestJS interceptor or Prisma middleware to split database queries (`findUnique`/`findMany` to read-replica, `create`/`update` to primary).
2. **Database Connection Pooling:**
   - Fine-tune connection pool configurations (e.g., using pgBouncer) for high traffic scaling.
3. **Failover Execution & Stress Tests:**
   - Author stress testing scripts (e.g., K6) simulating 500 concurrent requests/second on the queue and billing endpoints, showing successful recovery during DB failover.

#### Acceptance Criteria
- [ ] Read queries are successfully offloaded to the replica database.
- [ ] API uptime remains $\ge 99.9\%$ during replica offline simulate conditions.

---

## 💻 Intern Backend Tasks (4 Developers)

### 📋 Task 56: Statutory MOH (Ministry of Health) Disease Tracker & ICD-10 Exporter
**Story Points:** ~5  
**Role Target:** Standardized Reporting & Data Processing  
**Assignee:** Intern Developer 4  

#### Description
Create automated reporting templates to extract statutory health metrics and infectious disease prevalence logs based on ICD-10 classification codes for Ministry of Health submittals.

#### Detailed Requirements
1. **Infectious Disease Triggers:**
   - Set flags on specific ICD-10 codes (e.g., Tuberculosis, Cholera, Malaria) to automatically log to a national surveillance log table.
2. **MOH Reporting Engine:**
   - Endpoint `GET /api/reports/moh/weekly` exporting diagnostic stats grouped by region, age, gender, and disease category.
3. **CSV/XLSX Export Format:**
   - Enable spreadsheet download options utilizing libraries (e.g., `exceljs`).

#### Acceptance Criteria
- [ ] Export files download cleanly, mapping exact columns required by the national statutory formats.

---

### 📋 Task 57: Stock Reorder Thresholds & Daily Expiry Alerts
**Story Points:** ~5  
**Role Target:** Notification Dispatchers & Schedulers  
**Assignee:** Intern Developer 5  

#### Description
Develop the automatic warning dispatch system targeting items nearing expiry or dropping below critical safety stock thresholds.

#### Detailed Requirements
1. **Reorder Alert Checker:**
   - Daily scheduler to check if inventory counts are below a product's safety threshold, raising a warning email/in-app alert to procurement.
2. **Expiry Analyzer:**
   - Run scans checking batch expiration dates, sending `30-Day`, `60-Day`, and `90-Day` warning flags to hospital pharmacists.
3. **Disposal Logs:**
   - Endpoints to record expired stock disposals (`quantity`, `method`, `authorizedBy`).

#### Acceptance Criteria
- [ ] System automatically queues emails for products matching low-stock or near-expiry queries.

---

### 📋 Task 58: Patient Portal Portal - Discharge & Billing History Access
**Story Points:** ~5  
**Role Target:** Patient-Facing Security & External Access API  
**Assignee:** Intern Developer 6  

#### Description
Expose public-facing endpoints for patients to securely log in, download discharge summaries, view billing receipts, and inspect their active prescriptions.

#### Detailed Requirements
1. **Patient Receipts API:**
   - Endpoint `GET /api/patient-portal/receipts` displaying payment statuses and diagnostic fees.
2. **Prescription Status Monitor:**
   - Endpoint listing active medications and refills remaining, showing checkouts to local E-Vuze pharmacies.
3. **Discharge Summaries Downloader:**
   - Fetch signed clinical summary sheets as printable documents.

#### Acceptance Criteria
- [ ] Data is strictly gated so patients can only query records matching their authenticated token user ID.

---

### 📋 Task 59: End-to-End API Integration & Smoke Test Suite
**Story Points:** ~5  
**Role Target:** Quality Assurance & Automated Testing  
**Assignee:** Intern Developer 7  

#### Description
Compile the ultimate integration smoke test suite running tests across all hospital modules (Queue → Consultation → Labs → Billing → Pharmacy Checkout).

#### Detailed Requirements
1. **Jest E2E Sequence:**
   - Build a comprehensive Jest test suite representing a patient journey from check-in to checkout.
2. **Postman Collection Refinement:**
   - Update the workspace Postman collections to contain latest headers, payload formats, and verification variables.
3. **Mock Data Clean-Up script:**
   - Provide a database cleanup utility script for staging environments to flush test records safely without dropping core schema configurations.

#### Acceptance Criteria
- [ ] Full E2E suite passes in CI/CD pipeline.
- [ ] Seed data restores database to a clean, usable demo state.
