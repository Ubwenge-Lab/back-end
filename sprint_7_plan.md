# Sprint 7 Plan: Hospital Queue Flow, EMR Aggregation & Claims Reconciliation

This sprint plan defines the backend development tasks for **Sprint 7**, focusing on hospital patient lifecycle management, Electronic Medical Records (EMR) compilation, and insurance claims processing.

It is structured for a team of **7 Backend Developers** (3 Seniors, 4 Interns).

---

## 👑 Senior Backend Tasks (3 Developers)

### 📋 Task 39: Hospital Patient Queue Management & Flow Engine
**Story Points:** ~8  
**Role Target:** Lead Systems Architect & Real-Time Specialist  
**Assignee:** Senior Developer 1  

#### Description
Build the state-machine and queuing system that manages the flow of in-person patients as they move from check-in to triage, consultation, billing, and pharmacy.

#### Detailed Requirements
1. **Patient State Machine:**
   - Implement status endpoints mapping the patient lifecycle: `CHECKED_IN` → `TRIAGED` → `IN_CONSULTATION` → `AWAITING_BILLING` → `DISCHARGED`.
2. **Real-time Queue Gateway (WebSockets):**
   - Build a NestJS WebSocket gateway to broadcast live queue updates (e.g., *"Next patient to Room 4"* or estimated wait times) to hospital displays.
3. **Queue Sorting Logic:**
   - Roster patients by appointment time, check-in order, and urgency parameters (flagged during nurse triage).

#### Acceptance Criteria
- [ ] Queue status updates write atomically to the database.
- [ ] Sockets successfully broadcast updates to connected dashboards under $100\text{ms}$.
- [ ] Priority/emergency appointments automatically bypass the standard FIFO queue order.

---

### 📋 Task 40: Unified EMR Aggregation & Signed Medical Chart Generator
**Story Points:** ~8  
**Role Target:** Core Data Security & PDF Engine Developer  
**Assignee:** Senior Developer 2  

#### Description
Consolidate all historical encounters (vitals, diagnoses, prescription verifications, lab uploads) into a single Electronic Medical Record (EMR) schema, and build a signed PDF generator.

#### Detailed Requirements
1. **Structured EMR Aggregate Endpoint:**
   - Create `GET /api/patients/:id/emr` to fetch a patient's historical medical timeline, resolving relational data securely.
2. **Cryptographic PDF Chart Generation:**
   - Integrate a PDF library (such as `PDFKit` or `pdf-lib`) to compile a beautiful, printable patient medical chart.
   - Generate an SHA-256 hash signature of the chart content, signed with the hospital's private key, to prevent tampering.
3. **Restricted EMR Sharing:**
   - Allow patients to generate one-time, time-limited download links for their signed medical history to share with outside practitioners.

#### Acceptance Criteria
- [ ] EMR queries resolve under $200\text{ms}$ utilizing indexing.
- [ ] Generated PDFs contain a verifiable cryptographic footer.
- [ ] External download links expire automatically after the configured timeframe.

---

### 📋 Task 41: Automated Insurance Claims Dispatch & Billing Reconciliation
**Story Points:** ~8  
**Role Target:** Financial Ledger & Integrations Specialist  
**Assignee:** Senior Developer 3  

#### Description
Automate the generation and submission of claims to insurance providers upon doctor consultation checkout, and build a reconciliation panel for hospital finance officers.

#### Detailed Requirements
1. **Invoice-to-Claim Pipeline:**
   - Upon creation of a hospital `Invoice` for insured patients, automatically generate a corresponding `InsuranceClaim` record.
2. **Insurance Dispatch Simulator:**
   - Build a simulated dispatch worker that maps diagnostic codes (ICD-10) and co-pays, serializes the claim payload, and submits it to mock insurance endpoints (RSSB, MMI, RAMA, Britam).
3. **Reconciliation Engine:**
   - Expose endpoints (`GET /api/admin/claims/reconciliation`) for finance officers to track claim statuses (`SUBMITTED`, `PAID`, `DENIED`), manually adjust payouts, and reconcile hospital books.

#### Acceptance Criteria
- [ ] Completed invoices automatically create matching claims with correct insurance coverage calculations.
- [ ] Payout balances reconcile cleanly, flagging any discrepancy between the claim amount and the insurer's actual payout.

---

## 💻 Intern Backend Tasks (4 Developers)

### 📋 Task 42: Patient-Doctor Chat Gateway & Notification Dispatch
**Story Points:** ~5  
**Role Target:** Communication & WebSockets  
**Assignee:** Intern Developer 4  

#### Description
Build a WebSocket-based chat gateway to allow patients to ask follow-up questions to their treating doctors after an appointment.

#### Detailed Requirements
1. **Chat Session Boundaries:**
   - Restrict chat rooms to patients and doctors with an active or recently completed appointment ($< 30\text{ days}$).
2. **History & Persistence:**
   - Store chat logs in the database (`message`, `senderId`, `timestamp`).
3. **Unread Badges & Push Notifications:**
   - Send real-time notifications to the doctor or patient if they are offline when a message is sent.

#### Acceptance Criteria
- [ ] Socket connection limits rooms strictly to patients and their assigned doctors.
- [ ] Chat messages persist correctly in the database.
- [ ] Push notifications are triggered when message receivers are disconnected.

---

### 📋 Task 43: Out-of-Stock Hospital Drug Dispatch Fallback
**Story Points:** ~5  
**Role Target:** Inventory Logistics & Inter-Company Webhooks  
**Assignee:** Intern Developer 5  

#### Description
Build the fallback system that automatically dispatches prescriptions to external E-Vuze pharmacies if the hospital's internal pharmacy is out of stock.

#### Detailed Requirements
1. **Stock Checker Fallback:**
   - If a doctor prescribes a medication that is out of stock in the hospital's database, flag the prescription as `DISPATCHED_EXTERNAL`.
2. **Triangulated Pharmacy Search:**
   - Search external E-Vuze pharmacies within a $10\text{km}$ radius of the patient's coordinates that have the required stock.
3. **External Fulfillment Webhook:**
   - Expose a secure callback route for external pharmacies to update the hospital's prescription status to `FILLED` once picked up.

#### Acceptance Criteria
- [ ] Stock-outs successfully trigger fallback routing.
- [ ] Nearby pharmacies are correctly matched based on geolocation coordinates.
- [ ] Third-party webhooks update hospital records securely.

---

### 📋 Task 44: Department Schedules & Doctor Shift Roster
**Story Points:** ~5  
**Role Target:** Scheduling Logic & Calendar Restrictions  
**Assignee:** Intern Developer 6  

#### Description
Create the hospital department configuration and doctor roster scheduling backend endpoints.

#### Detailed Requirements
1. **Hospital Department Scaffold:**
   - Endpoints to manage hospital departments (Pediatrics, Cardiology, ER, etc.) and assign doctors to them.
2. **Roster Shift Planner:**
   - Endpoints for hospital admins to set doctor weekly shifts (start time, end time, maximum patient slots).
3. **Slot Availability Validations:**
   - Intercept appointment booking requests to ensure bookings only occur during a doctor's active, unbooked shift slots.

#### Acceptance Criteria
- [ ] Hospital departments can be created and queried cleanly.
- [ ] Shift booking checks reject appointment requests outside assigned working hours.
- [ ] Doctor rosters are fully modifiable by admin users.

---

### 📋 Task 45: Central Logging, Correlation IDs, & Telemetry
**Story Points:** ~5  
**Role Target:** DevOps, Monitoring, & Security Auditing  
**Assignee:** Intern Developer 7  

#### Description
Establish central error monitoring, trace logging using correlation IDs, and basic API performance telemetry.

#### Detailed Requirements
1. **Request Correlation ID Middleware:**
   - Generate a unique request ID (`x-request-id`) for every incoming HTTP request and forward it through the Winston logging pipeline.
2. **Slow Query / Timeout Alerts:**
   - Log warning statements for any database transaction taking longer than $1500\text{ms}$.
3. **Health Check Endpoint:**
   - Expose `GET /api/health` returning database connectivity, memory usage, and Redis queue status for server monitoring.

#### Acceptance Criteria
- [ ] Every request log line includes a tracing correlation ID.
- [ ] Telemetry API route returns accurate CPU/RAM and database connection metrics.
- [ ] Slow query logs print warnings to stdout.
