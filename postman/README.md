# Hospital Smoke Journey — Postman Collection

Walks a patient through the full flow: booking an appointment, getting
checked in, triage, consultation, lab order, billing, and pharmacy
checkout. One folder per stage, run top to bottom.

## Setup

Fixture users need to exist in whatever environment you're pointing
this at:

| Role | Email |
|---|---|
| Doctor | `test_smoke_doctor@hospital.com` |
| Receptionist | `test_smoke_receptionist@hospital.com` |
| Nurse | `test_smoke_nurse@hospital.com` |
| Technician | `test_smoke_technician@hospital.com` |
| Patient | `test_smoke_patient@patient.com` |
| Branch manager | `test_smoke_branchmanager@pharmacy.com` |

These are the same fixtures the Jest e2e suite creates, so the easiest
way to get them in place is to point this at an environment where that
suite has run. Everything created here uses the `TEST_SMOKE_` /
`test_smoke_` prefix so `cleanup-staging.ts` can flush it safely.

Before running, fill in the environment file:

- `baseUrl`
- `doctorId` — TEST_SMOKE_ doctor fixture (license `TEST-SMOKE-LIC-1`)
- `patientId`
- `pharmacyId`, `branchId`, `medicationId`
- `amountReceived` — set to the order's `patientPayment` (or `total`)
  before running the "Cashier records payment" request

Everything else — tokens, appointment id, invoice id, lab order id,
order id, payment id — gets picked up automatically from each
response and carried forward to the next request.

## Running it

Import both files into Postman, pick the Staging environment, run the
collection in order. Or from the CLI:

```bash
newman run hospital-smoke-journey.postman_collection.json \
  -e staging.postman_environment.json
```

## Notes

- `POST /appointments/book` returns the appointment nested under
  `appointment`, not at the top level.
- `POST /appointments/:id/consult` returns the invoice nested under
  `invoice`.
- `POST /payments/record` returns `{ success, receiptNumber }` — there's
  no `status` field on that response.

These three are checked in the corresponding requests' test scripts;
worth knowing if you're extending the collection so you don't assume a
flat response shape that isn't there.