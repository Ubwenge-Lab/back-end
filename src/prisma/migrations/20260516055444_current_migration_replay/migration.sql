/*
  Warnings:

  - You are about to drop the column `notes` on the `appointments` table. All the data in the column will be lost.
  - You are about to drop the column `scheduledAt` on the `appointments` table. All the data in the column will be lost.
  - The primary key for the `hospital_drug_stock` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `drugId` on the `hospital_drug_stock` table. All the data in the column will be lost.
  - You are about to alter the column `unitPrice` on the `invoice_items` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(12,2)`.
  - You are about to alter the column `subtotal` on the `invoice_items` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(12,2)`.
  - You are about to alter the column `totalAmount` on the `invoices` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(12,2)`.
  - You are about to drop the column `createdAt` on the `order_items` table. All the data in the column will be lost.
  - The `paymentStatus` column on the `orders` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - You are about to drop the column `hospitalId` on the `patients` table. All the data in the column will be lost.
  - You are about to alter the column `amount` on the `payments` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(12,2)`.
  - You are about to drop the column `deliveryZones` on the `pharmacies` table. All the data in the column will be lost.
  - Added the required column `date` to the `appointments` table without a default value. This is not possible if the table is not empty.
  - Made the column `phone` on table `branches` required. This step will fail if there are existing NULL values in that column.
  - Added the required column `updatedAt` to the `doctors` table without a default value. This is not possible if the table is not empty.
  - The required column `id` was added to the `hospital_drug_stock` table with a prisma-level default value. This is not possible if the table is not empty. Please add this column as optional, then populate it before making it required.
  - Added the required column `name` to the `hospital_drug_stock` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `hospital_drug_stock` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "hospital_drug_stock" DROP CONSTRAINT "hospital_drug_stock_hospitalId_fkey";

-- DropForeignKey
ALTER TABLE "medications" DROP CONSTRAINT "medications_pharmacyId_fkey";

-- DropForeignKey
ALTER TABLE "order_items" DROP CONSTRAINT "order_items_medicationId_fkey";

-- DropForeignKey
ALTER TABLE "orders" DROP CONSTRAINT "orders_branchId_fkey";

-- DropForeignKey
ALTER TABLE "patients" DROP CONSTRAINT "patients_hospitalId_fkey";

-- DropForeignKey
ALTER TABLE "stock_transfers" DROP CONSTRAINT "stock_transfers_fromBranchId_fkey";

-- DropForeignKey
ALTER TABLE "stock_transfers" DROP CONSTRAINT "stock_transfers_toBranchId_fkey";

-- DropIndex
DROP INDEX "branches_branchStatus_idx";

-- DropIndex
DROP INDEX "medications_name_idx";

-- DropIndex
DROP INDEX "medications_pharmacyId_idx";

-- DropIndex
DROP INDEX "medications_registryId_idx";

-- DropIndex
DROP INDEX "orders_branchId_idx";

-- DropIndex
DROP INDEX "orders_orderNumber_idx";

-- DropIndex
DROP INDEX "patients_mrn_key";

-- DropIndex
DROP INDEX "pharmacies_status_idx";

-- DropIndex
DROP INDEX "staff_userId_idx";

-- AlterTable
ALTER TABLE "appointments" DROP COLUMN "notes",
DROP COLUMN "scheduledAt",
ADD COLUMN     "date" TIMESTAMP(3) NOT NULL,
ALTER COLUMN "reason" DROP NOT NULL;

-- AlterTable
ALTER TABLE "branches" ADD COLUMN     "branchManagerName" TEXT,
ADD COLUMN     "licenseUrl" TEXT,
ADD COLUMN     "status" "BranchStatus" NOT NULL DEFAULT 'INVITED',
ALTER COLUMN "phone" SET NOT NULL,
ALTER COLUMN "latitude" DROP NOT NULL,
ALTER COLUMN "longitude" DROP NOT NULL,
ALTER COLUMN "branchManagerEmail" DROP NOT NULL;

-- AlterTable
ALTER TABLE "doctors" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "isAvailable" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "rating" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "hospital_drug_stock" DROP CONSTRAINT "hospital_drug_stock_pkey",
DROP COLUMN "drugId",
ADD COLUMN     "batchNumber" TEXT,
ADD COLUMN     "category" TEXT,
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "id" TEXT NOT NULL,
ADD COLUMN     "manufacturer" TEXT,
ADD COLUMN     "name" TEXT NOT NULL,
ADD COLUMN     "requiresPrescription" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
ALTER COLUMN "expiryDate" DROP NOT NULL,
ADD CONSTRAINT "hospital_drug_stock_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "hospitals" ADD COLUMN     "licenseNumber" TEXT;

-- AlterTable
ALTER TABLE "invoice_items" ALTER COLUMN "unitPrice" SET DATA TYPE DECIMAL(12,2),
ALTER COLUMN "subtotal" SET DATA TYPE DECIMAL(12,2);

-- AlterTable
ALTER TABLE "invoices" ALTER COLUMN "totalAmount" SET DATA TYPE DECIMAL(12,2);

-- AlterTable
ALTER TABLE "medications" ADD COLUMN     "batchNumber" TEXT,
ADD COLUMN     "expiryDate" TIMESTAMP(3),
ADD COLUMN     "manufacturer" TEXT,
ALTER COLUMN "pharmacyId" DROP NOT NULL,
ALTER COLUMN "category" DROP NOT NULL;

-- AlterTable
ALTER TABLE "order_items" DROP COLUMN "createdAt";

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "address" TEXT,
ADD COLUMN     "adminFee" DOUBLE PRECISION,
ADD COLUMN     "couponCode" TEXT,
ADD COLUMN     "deliveryEmail" TEXT,
ADD COLUMN     "deliveryPhone" TEXT,
ADD COLUMN     "discountAmount" DOUBLE PRECISION DEFAULT 0,
ADD COLUMN     "hospitalBranchId" TEXT,
ADD COLUMN     "insurancePolicyNumber" TEXT,
ADD COLUMN     "insuranceProvider" TEXT,
ADD COLUMN     "isPrescriptionValidated" BOOLEAN DEFAULT false,
ADD COLUMN     "latitude" DOUBLE PRECISION,
ADD COLUMN     "longitude" DOUBLE PRECISION,
ADD COLUMN     "orderDate" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "prescriptionImageUrl" TEXT,
ADD COLUMN     "totalItems" INTEGER,
ALTER COLUMN "branchId" DROP NOT NULL,
ALTER COLUMN "orderNumber" DROP NOT NULL,
ALTER COLUMN "deliveryFee" DROP NOT NULL,
ALTER COLUMN "subtotal" DROP NOT NULL,
ALTER COLUMN "subtotal" SET DEFAULT 0,
ALTER COLUMN "paymentMethod" DROP NOT NULL,
DROP COLUMN "paymentStatus",
ADD COLUMN     "paymentStatus" TEXT,
ALTER COLUMN "patientPayment" DROP NOT NULL;

-- AlterTable
ALTER TABLE "patients" DROP COLUMN "hospitalId",
ALTER COLUMN "mrn" DROP NOT NULL;

-- AlterTable
ALTER TABLE "payments" ALTER COLUMN "amount" SET DATA TYPE DECIMAL(12,2);

-- AlterTable
ALTER TABLE "pharmacies" DROP COLUMN "deliveryZones",
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ALTER COLUMN "representativeName" DROP NOT NULL,
ALTER COLUMN "latitude" DROP NOT NULL,
ALTER COLUMN "longitude" DROP NOT NULL,
ALTER COLUMN "dateOfIncorporation" DROP NOT NULL,
ALTER COLUMN "rdbCertificate" DROP NOT NULL,
ALTER COLUMN "pharmacyLicense" DROP NOT NULL;

-- AlterTable
ALTER TABLE "prescriptions" ADD COLUMN     "appointmentId" TEXT,
ADD COLUMN     "diagnosis" TEXT,
ADD COLUMN     "notes" TEXT,
ALTER COLUMN "fileUrl" DROP NOT NULL,
ALTER COLUMN "fileName" DROP NOT NULL,
ALTER COLUMN "fileType" DROP NOT NULL;

-- AlterTable
ALTER TABLE "staff" ADD COLUMN     "address" TEXT;

-- AlterTable
ALTER TABLE "stock_transfers" ADD COLUMN     "rejectionReason" TEXT;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "firstName" TEXT,
ADD COLUMN     "lastName" TEXT;

-- CreateTable
CREATE TABLE "hospital_patient_registrations" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "hospitalId" TEXT NOT NULL,
    "mrn" TEXT NOT NULL,
    "registeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hospital_patient_registrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hospital_payments" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "insuranceProvider" TEXT,
    "insuranceClaimRef" TEXT,
    "notes" TEXT,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hospital_payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "hospital_patient_registrations_patientId_idx" ON "hospital_patient_registrations"("patientId");

-- CreateIndex
CREATE INDEX "hospital_patient_registrations_hospitalId_idx" ON "hospital_patient_registrations"("hospitalId");

-- CreateIndex
CREATE UNIQUE INDEX "hospital_patient_registrations_patientId_hospitalId_key" ON "hospital_patient_registrations"("patientId", "hospitalId");

-- CreateIndex
CREATE UNIQUE INDEX "hospital_patient_registrations_hospitalId_mrn_key" ON "hospital_patient_registrations"("hospitalId", "mrn");

-- CreateIndex
CREATE INDEX "hospital_payments_invoiceId_idx" ON "hospital_payments"("invoiceId");

-- CreateIndex
CREATE INDEX "appointments_hospitalId_idx" ON "appointments"("hospitalId");

-- CreateIndex
CREATE INDEX "doctors_specialization_idx" ON "doctors"("specialization");

-- CreateIndex
CREATE INDEX "hospital_staff_userId_idx" ON "hospital_staff"("userId");

-- AddForeignKey
ALTER TABLE "hospital_patient_registrations" ADD CONSTRAINT "hospital_patient_registrations_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "hospitals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hospital_patient_registrations" ADD CONSTRAINT "hospital_patient_registrations_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medications" ADD CONSTRAINT "medications_pharmacyId_fkey" FOREIGN KEY ("pharmacyId") REFERENCES "pharmacies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hospital_drug_stock" ADD CONSTRAINT "hospital_drug_stock_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "hospitals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prescriptions" ADD CONSTRAINT "prescriptions_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "appointments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_medicationId_fkey" FOREIGN KEY ("medicationId") REFERENCES "medications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hospital_payments" ADD CONSTRAINT "hospital_payments_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hospital_payments" ADD CONSTRAINT "hospital_payments_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_fromBranchId_fkey" FOREIGN KEY ("fromBranchId") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_toBranchId_fkey" FOREIGN KEY ("toBranchId") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
