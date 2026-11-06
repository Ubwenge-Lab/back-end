# UX Defect Inventory & Gallery (2026-Q4)
**Measurement Window:** Week 4 (Mon 19 Oct – Fri 23 Oct 2026)  
**Field Observation Locations:** Kigali & Kampala partner pharmacy counters, 2 inpatient clinics  
**Auditor:** Rosalba & UX QA Team

---

## 1. Summary of Defect Inventory

* **Total Recorded Interaction Defects:** 18
* **Blocking Workflow Defects (P0/P1):** 7
* **Visual Regressions / Layout Shifts (P2/P3):** 11

---

## 2. Top Five Blocking UX Defects

| Defect ID | Surface | Defect Summary | User Symptom | Technical Root Cause | Priority |
|---|---|---|---|---|---|
| **UX-01** | POS Counter | **Missing Checkout Button Loading Spinner** | Cashier taps "Pay" multiple times when backend latency exceeds 2 seconds, causing double submissions. | No button disable state on form submission in React POS form. | **P0 (Critical)** |
| **UX-02** | Medication Search | **Search Input Debounce Failure** | Autocomplete triggers backend API requests on every single keystroke instead of debouncing for 300ms. | Missing debounce hook on search input field. | **P0 (Critical)** |
| **UX-03** | Cart Review | **Layout Shift on Stock Availability Check** | Cart table shifts downward by 48px once async stock availability resolves, causing miss-clicks on "Remove". | No skeleton height reservation for stock badge container. | **P1 (High)** |
| **UX-04** | Prescription Intake | **Multi-Page Rx Upload Freeze** | Uploading 3+ image pages causes browser tab freeze during image canvas preprocessing. | Synchronous image compression running on main JavaScript thread. | **P1 (High)** |
| **UX-05** | Inpatient Billing | **Invoice Totals Stale Rendering** | Adding an item to invoice updates line items but leaves summary card totals unchanged until manual page reload. | React state mutation bypassing state updater hook. | **P1 (High)** |

---

## 3. Screen Capture & Defect Log

Screen recordings and visual diff captures are archived in the shared team artifact storage (`drive/baseline-2026-Q4/ux-gallery/`). Remediations for UX-01 and UX-02 are coupled directly with Week 6 and 7 API optimizations.

