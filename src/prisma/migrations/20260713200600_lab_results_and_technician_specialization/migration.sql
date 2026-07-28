-- CreateEnum
CREATE TYPE "TechnicianSpecialization" AS ENUM ('LAB', 'RADIOLOGY');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'LAB_RESULT_READY';
ALTER TYPE "NotificationType" ADD VALUE 'LAB_ORDER_REJECTED';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "DiagnosticStatus" ADD VALUE 'COLLECTED';
ALTER TYPE "DiagnosticStatus" ADD VALUE 'IN_PROGRESS';
ALTER TYPE "DiagnosticStatus" ADD VALUE 'REJECTED';

-- AlterTable
ALTER TABLE "hospital_staff" ADD COLUMN     "technicianSpecialization" "TechnicianSpecialization";

-- AlterTable
ALTER TABLE "diagnostic_orders" ADD COLUMN     "rejectedAt" TIMESTAMP(3),
ADD COLUMN     "rejectedById" TEXT,
ADD COLUMN     "rejectionReason" TEXT,
ADD COLUMN     "structuredResult" JSONB;

-- CreateTable
CREATE TABLE "lab_result_revisions" (
    "id" TEXT NOT NULL,
    "diagnosticOrderId" TEXT NOT NULL,
    "fileUrl" TEXT,
    "fileName" TEXT,
    "fileType" TEXT,
    "findings" TEXT,
    "resultValue" TEXT,
    "structuredResult" JSONB,
    "correctedById" TEXT NOT NULL,
    "correctionReason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lab_result_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "lab_result_revisions_diagnosticOrderId_idx" ON "lab_result_revisions"("diagnosticOrderId");

-- AddForeignKey
ALTER TABLE "lab_result_revisions" ADD CONSTRAINT "lab_result_revisions_diagnosticOrderId_fkey" FOREIGN KEY ("diagnosticOrderId") REFERENCES "diagnostic_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

