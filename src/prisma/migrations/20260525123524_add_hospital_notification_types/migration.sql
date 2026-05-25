-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'APPOINTMENT_BOOKED';
ALTER TYPE "NotificationType" ADD VALUE 'PATIENT_ARRIVED';
ALTER TYPE "NotificationType" ADD VALUE 'READY_FOR_DOCTOR';
ALTER TYPE "NotificationType" ADD VALUE 'CONSULTATION_COMPLETED';
ALTER TYPE "NotificationType" ADD VALUE 'PRESCRIPTION_DISPATCHED';
ALTER TYPE "NotificationType" ADD VALUE 'INVOICE_GENERATED';

-- AlterTable
ALTER TABLE "appointments" ADD COLUMN     "diagnosisSummary" TEXT,
ADD COLUMN     "doctorRecommendations" TEXT;

-- AlterTable
ALTER TABLE "prescriptions" ADD COLUMN     "hospitalId" TEXT;

-- CreateIndex
CREATE INDEX "attendance_branchId_status_clockInTime_idx" ON "attendance"("branchId", "status", "clockInTime");

-- CreateIndex
CREATE INDEX "hospital_invoices_hospitalId_paymentStatus_idx" ON "hospital_invoices"("hospitalId", "paymentStatus");

-- CreateIndex
CREATE INDEX "hospital_invoices_hospitalId_issuedAt_idx" ON "hospital_invoices"("hospitalId", "issuedAt");

-- CreateIndex
CREATE INDEX "hospital_invoices_patientId_paymentStatus_idx" ON "hospital_invoices"("patientId", "paymentStatus");

-- CreateIndex
CREATE INDEX "medications_pharmacyId_quantity_idx" ON "medications"("pharmacyId", "quantity");

-- CreateIndex
CREATE INDEX "medications_branchId_quantity_idx" ON "medications"("branchId", "quantity");

-- CreateIndex
CREATE INDEX "notifications_pharmacyId_isRead_idx" ON "notifications"("pharmacyId", "isRead");

-- CreateIndex
CREATE INDEX "notifications_patientId_isRead_idx" ON "notifications"("patientId", "isRead");

-- CreateIndex
CREATE INDEX "orders_pharmacyId_status_createdAt_idx" ON "orders"("pharmacyId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "orders_branchId_status_createdAt_idx" ON "orders"("branchId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "orders_pharmacyId_createdAt_idx" ON "orders"("pharmacyId", "createdAt");

-- CreateIndex
CREATE INDEX "orders_branchId_createdAt_idx" ON "orders"("branchId", "createdAt");

-- CreateIndex
CREATE INDEX "prescriptions_hospitalId_idx" ON "prescriptions"("hospitalId");

-- AddForeignKey
ALTER TABLE "prescriptions" ADD CONSTRAINT "prescriptions_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "hospitals"("id") ON DELETE SET NULL ON UPDATE CASCADE;
