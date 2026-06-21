# Sprint 8 Plan: Inpatient Operations, Lab/Radiology Integrations & Ward Management

This sprint plan defines the backend development tasks for **Sprint 8**, focusing on inpatient admissions, ward logistics, lab/radiology workflows, and surgical scheduling.

It is structured for a team of **7 Backend Developers** (3 Seniors, 4 Interns).

---

## 👑 Senior Backend Tasks (3 Developers)

### 📋 Task 46: Bed Management & Inpatient Admission Lifecycle Engine
**Story Points:** ~8  
**Role Target:** Lead Systems Architect & Ward Logistics Developer  
**Assignee:** Senior Developer 1  

#### Description
Build the backend schema and state-machine to manage inpatient admissions, ward occupancy, and patient bed transfers.

#### Detailed Requirements
1. **Ward & Bed Schema:**
   - Create tables for Wards (e.g., ICU, Pediatric, General Ward), Rooms, Beds, and Admission records.
2. **Admission & Discharge Workflows:**
   - Implement `POST /api/inpatient/admissions` to admit a patient to a specific bed, transitioning status to `ADMITTED`.
   - Implement transfer endpoints to move a patient from Bed A to Bed B with history tracking.
   - Implement discharge workflows, requiring clearance from billing and clinical leaders.
3. **Occupancy Matrix API:**
   - Build a real-time occupancy query (`GET /api/inpatient/occupancy`) reflecting total, occupied, and maintenance bed status.

#### Acceptance Criteria
- [ ] DB locks prevent double-booking of a single bed at the database level.
- [ ] Transfer records capture timestamp, source bed, target bed, and authorizing staff member.
- [ ] Discharge endpoint fails if the patient has outstanding/unbilled hospital fees.

---

### 📋 Task 47: Laboratory & Radiology Diagnostic Order Workflow
**Story Points:** ~8  
**Role Target:** Clinical Integrations & File Storage Developer  
**Assignee:** Senior Developer 2  

#### Description
Build the backend flows to order diagnostic tests (blood, urine, X-Ray, MRI), record results, upload imaging files, and notify requesting physicians.

#### Detailed Requirements
1. **Diagnostic Order Pipeline:**
   - Endpoints for doctors to request tests: `POST /api/diagnostics/orders` (linked to ICD-10 codes).
2. **Technician Portal APIs:**
   - Endpoints for laboratory/radiology technicians to view queue requests, input numeric/textual findings, and upload files (PDFs, DICOM files, or high-res images).
3. **Notification Trigger:**
   - Automatically notify the doctor when results are finalized (via server-sent events or push alerts).

#### Acceptance Criteria
- [ ] Diagnostic reports store findings securely and attach references to raw uploaded image assets.
- [ ] Order state moves from `ORDERED` → `SAMPLE_COLLECTED` → `COMPLETED`.
- [ ] Uploaded medical images/PDF reports are restricted to authorized medical personnel via pre-signed S3 URLs.

---

### 📋 Task 48: Inpatient Billing Aggregator & Hourly Ward Charge Engine
**Story Points:** ~8  
**Role Target:** Financial Ledger & Billing Specialist  
**Assignee:** Senior Developer 3  

#### Description
Build the background scheduler and APIs to aggregate hourly/daily ward charges (bed fees, nursing care, doctor visits) and compile them into a unified patient invoice.

#### Detailed Requirements
1. **Cron-based Billing Worker:**
   - Build a Cron job that runs daily at midnight to calculate and write ward stay charges based on the patient's admitted bed tier (General vs ICU).
2. **Clinical Consumption Billing:**
   - Provide APIs for nurses to log medication administration or diagnostic supplies consumed at the bedside, instantly appending them to the patient’s active inpatient bill.
3. **Final Bill Consolidation:**
   - Compile pharmacy orders, lab orders, bed fees, and doctor fees into a single checkout invoice.

#### Acceptance Criteria
- [ ] Daily cron correctly computes midnight bed charges without duplicate charges.
- [ ] Side-car fees (meds, syringes) update the checkout total immediately.
- [ ] Patient checkout invoice displays itemized charges grouped by department.

---

## 💻 Intern Backend Tasks (4 Developers)

### 📋 Task 49: Nurse Ward Round Notes & Inpatient Vitals Tracker
**Story Points:** ~5  
**Role Target:** Clinical Records & Form Validations  
**Assignee:** Intern Developer 4  

#### Description
Build the endpoints for nurses to log periodic ward round notes, track patient vitals (temperature, heart rate, blood pressure), and record medication administration charts (MAR).

#### Detailed Requirements
1. **Vitals Recording Endpoint:**
   - `POST /api/inpatient/admissions/:id/vitals` to log clinical vitals over time.
2. **MAR (Medication Administration Record) Logs:**
   - API for logging exactly when a prescribed medication was administered to a bed-ridden patient (`administeredBy`, `timestamp`, `dose`).
3. **Ward Round Checklist:**
   - Structured checklist API for daily nursing shift change handovers.

#### Acceptance Criteria
- [ ] Vitals endpoints enforce strict range checks (e.g., reject impossible blood pressures or temperatures).
- [ ] MAR logs are read-only once written to maintain medical integrity.

---

### 📋 Task 50: Medical Consumables & Lab Reagent Stock Deduction
**Story Points:** ~5  
**Role Target:** Inventory & Database Triggers  
**Assignee:** Intern Developer 5  

#### Description
Automate inventory level deductions for clinical consumables (syringes, surgical gloves) and lab reagents whenever procedures or tests are completed.

#### Detailed Requirements
1. **BOM (Bill of Materials) Mapping:**
   - Create a mapping schema linking procedures/tests to standard consumables used (e.g., *Blood Test uses 1 syringe, 1 test tube*).
2. **Auto-Deduction Engine:**
   - Intercept diagnostic completion states and deduct corresponding item counts from the central hospital stock database.
3. **Stock Discrepancy Logger:**
   - Enable manual adjustments by stock managers if actual shelf inventory differs from auto-deducted amounts.

#### Acceptance Criteria
- [ ] Completed diagnostic orders decrease item counts in the inventory database.
- [ ] Stock goes negative alert/error if quantity drops below critical threshold.

---

### 📋 Task 51: Surgical Operations & Operating Theater Scheduler
**Story Points:** ~5  
**Role Target:** Schedule Collision Detection & Calendar Integrations  
**Assignee:** Intern Developer 6  

#### Description
Build the backend scheduling engine to book operating theaters, assign surgical teams (surgeons, assistants, anesthesiologists), and record post-operation summary reports.

#### Detailed Requirements
1. **Theater Reservation API:**
   - Create reservation endpoints checking for room, surgeon, and equipment availability.
2. **Surgical Team Assignment:**
   - Map roles (Surgeon, Anesthesiologist, Nurse) to theater bookings with collision warnings if a team member is booked elsewhere.
3. **Post-Op Report Vault:**
   - Create endpoints for surgeons to log operation notes, duration, anesthesia details, and surgical outcomes.

#### Acceptance Criteria
- [ ] Scheduler rejects overlapping theater bookings.
- [ ] The system logs collision warning flags for team members booked in concurrent slots.

---

### 📋 Task 52: Inter-Hospital Patient Referral Gateway
**Story Points:** ~5  
**Role Target:** EMR Portability & Data Sharing  
**Assignee:** Intern Developer 7  

#### Description
Create the secure outbound referral engine to export patient medical data and generate transfer summary packages for external hospitals.

#### Detailed Requirements
1. **Outbound Referral API:**
   - Endpoint `POST /api/referrals` to record referral target hospital, referral reason, and authorizing doctor.
2. **EMR Export Package:**
   - Package EMR history into a standardized JSON/PDF export that can be sent to target clinics.
3. **Referral Handshake Webhooks:**
   - Build a webhook notifier to post referral alerts to external E-Vuze nodes.

#### Acceptance Criteria
- [ ] Export package outputs verified EMR entries from the current hospital stay.
- [ ] Webhook includes cryptographic payload verification signatures.
