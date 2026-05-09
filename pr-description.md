# Feature: Branch Location Verification & Super Admin Email Alerts

## 📝 Summary
This PR introduces a robust location verification workflow for Branches, bringing it to parity with the existing Pharmacy verification system. It exposes new endpoints for the Super Admin to fetch and verify branch coordinates. 

Additionally, this PR significantly upgrades the platform's notification system by introducing automated, beautifully styled email alerts for the Super Admin to ensure critical events (like new registrations) are never missed. 

## ✨ What's New
- **Branch Location Verification:**
  - Added `isLocationVerified` and `locationVerifiedAt` fields to the `Branch` model.
  - Created `GET /api/super-admin/branches/unverified-locations` to fetch branches needing coordinate verification.
  - Created `PATCH /api/super-admin/branches/:id/verify-location` to allow Super Admins to approve coordinates.
  - Reused the `VerifyLocationDto` to maintain architectural consistency across both pharmacies and branches.
  - *Bug Fix*: Fixed a Prisma schema constraint bug by removing `.not: null` checks on the `latitude` and `longitude` fields (which are now strictly required).

- **Super Admin Email Alerts:**
  - Designed a new sleek, dark-themed "Super Admin Alert" email template in `email.service.ts`.
  - The system now safely pulls the `SUPER_ADMIN_EMAIL` directly from the `.env` file (configured to `info@ubwengelab.rw`).
  - **Pharmacy Registration Alert:** The Super Admin receives an instant email as soon as a new Pharmacy verifies their email and requires approval.
  - **Branch Registration Alert:** The Super Admin receives an email whenever a Pharmacy HQ registers a new branch and its coordinates are pending verification.

## 🔨 Commits
- `a1b9377` update: updated the superadmin service to fetch unverified branches and review
- `83510ab` update: updated the notification+email service to notify users via email

## 🧪 Test Plan
**1. Setup & Migration**
- Pull this branch locally.
- Run `npx prisma migrate dev` to ensure the new database columns are added (`isLocationVerified`).
- Run `npx ts-node src/prisma/seed.ts` to populate the database with unverified branches.

**2. Test Postman Endpoints**
- Log in as the Super Admin via `POST /api/auth/login`.
- Send a request to `GET /api/super-admin/branches/unverified-locations`. Ensure you get a 200 OK with an array of branches.
- Copy an ID from the response and send a `PATCH` request to `/api/super-admin/branches/:id/verify-location` with `{"verified": true}`.
- Re-run the `GET` request and verify that the branch was successfully removed from the unverified list.

**3. Test Email Notifications**
- Log in as an existing Pharmacy HQ and create a new branch.
- Check the server console or your Resend dashboard to verify that the Super Admin Alert email was successfully fired to `info@ubwengelab.rw`.
