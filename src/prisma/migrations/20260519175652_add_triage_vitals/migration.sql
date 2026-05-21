/*
  Warnings:

  - The primary key for the `hospital_drug_stock` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `batchNumber` on the `hospital_drug_stock` table. All the data in the column will be lost.
  - You are about to drop the column `category` on the `hospital_drug_stock` table. All the data in the column will be lost.
  - You are about to drop the column `createdAt` on the `hospital_drug_stock` table. All the data in the column will be lost.
  - You are about to drop the column `description` on the `hospital_drug_stock` table. All the data in the column will be lost.
  - You are about to drop the column `id` on the `hospital_drug_stock` table. All the data in the column will be lost.
  - You are about to drop the column `manufacturer` on the `hospital_drug_stock` table. All the data in the column will be lost.
  - You are about to drop the column `name` on the `hospital_drug_stock` table. All the data in the column will be lost.
  - You are about to drop the column `requiresPrescription` on the `hospital_drug_stock` table. All the data in the column will be lost.
  - You are about to drop the column `updatedAt` on the `hospital_drug_stock` table. All the data in the column will be lost.
  - You are about to alter the column `unitPrice` on the `hospital_drug_stock` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(12,2)`.
  - You are about to drop the column `paymentId` on the `invoices` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[appointmentId]` on the table `invoices` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `firstName` to the `doctors` table without a default value. This is not possible if the table is not empty.
  - Added the required column `lastName` to the `doctors` table without a default value. This is not possible if the table is not empty.
  - Added the required column `drugId` to the `hospital_drug_stock` table without a default value. This is not possible if the table is not empty.
  - Made the column `expiryDate` on table `hospital_drug_stock` required. This step will fail if there are existing NULL values in that column.

*/
-- CreateEnum
CREATE TYPE "HospitalBillingStatus" AS ENUM ('UNPAID', 'PAID', 'INSURANCE_PENDING');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AppointmentStatus" ADD VALUE 'ARRIVED';
ALTER TYPE "AppointmentStatus" ADD VALUE 'IN_TRIAGE';
ALTER TYPE "AppointmentStatus" ADD VALUE 'READY_FOR_DOCTOR';

-- DropForeignKey
ALTER TABLE "hospital_drug_stock" DROP CONSTRAINT "hospital_drug_stock_hospitalId_fkey";

-- DropForeignKey
ALTER TABLE "hospital_staff" DROP CONSTRAINT "hospital_staff_userId_fkey";

-- DropForeignKey
ALTER TABLE "invoices" DROP CONSTRAINT "invoices_paymentId_fkey";

-- AlterTable
ALTER TABLE "appointments" ADD COLUMN     "notes" TEXT;

-- AlterTable
ALTER TABLE "doctors" ADD COLUMN     "firstName" TEXT NOT NULL,
ADD COLUMN     "lastName" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "hospital_drug_stock" DROP CONSTRAINT "hospital_drug_stock_pkey",
DROP COLUMN "batchNumber",
DROP COLUMN "category",
DROP COLUMN "createdAt",
DROP COLUMN "description",
DROP COLUMN "id",
DROP COLUMN "manufacturer",
DROP COLUMN "name",
DROP COLUMN "requiresPrescription",
DROP COLUMN "updatedAt",
ADD COLUMN     "drugId" TEXT NOT NULL,
ADD COLUMN     "lastUpdated" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ALTER COLUMN "unitPrice" SET DATA TYPE DECIMAL(12,2),
ALTER COLUMN "expiryDate" SET NOT NULL,
ADD CONSTRAINT "hospital_drug_stock_pkey" PRIMARY KEY ("drugId", "hospitalId");

-- AlterTable
ALTER TABLE "invoices" DROP COLUMN "paymentId",
ADD COLUMN     "appointmentId" TEXT;

-- CreateTable
CREATE TABLE "triagevitals" (
    "id" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "bloodPressure" TEXT NOT NULL,
    "temperature" DOUBLE PRECISION NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL,
    "heartRate" INTEGER NOT NULL,
    "oxygenSaturation" INTEGER NOT NULL,
    "nurseNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "triagevitals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hospital_invoices" (
    "id" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "hospitalId" TEXT NOT NULL,
    "totalAmount" DECIMAL(12,2) NOT NULL,
    "paymentStatus" "HospitalBillingStatus" NOT NULL DEFAULT 'UNPAID',
    "insuranceCovered" BOOLEAN NOT NULL DEFAULT false,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hospital_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hospital_invoice_items" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitCost" DECIMAL(12,2) NOT NULL,
    "subtotal" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "hospital_invoice_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hospital_configs" (
    "id" TEXT NOT NULL,
    "hospitalId" TEXT NOT NULL,
    "consultationFee" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "triageFee" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hospital_configs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "triagevitals_appointmentId_key" ON "triagevitals"("appointmentId");

-- CreateIndex
CREATE UNIQUE INDEX "hospital_invoices_appointmentId_key" ON "hospital_invoices"("appointmentId");

-- CreateIndex
CREATE INDEX "hospital_invoices_patientId_idx" ON "hospital_invoices"("patientId");

-- CreateIndex
CREATE INDEX "hospital_invoices_hospitalId_idx" ON "hospital_invoices"("hospitalId");

-- CreateIndex
CREATE INDEX "hospital_invoice_items_invoiceId_idx" ON "hospital_invoice_items"("invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "hospital_configs_hospitalId_key" ON "hospital_configs"("hospitalId");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_appointmentId_key" ON "invoices"("appointmentId");

-- AddForeignKey
ALTER TABLE "hospital_staff" ADD CONSTRAINT "hospital_staff_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hospital_drug_stock" ADD CONSTRAINT "hospital_drug_stock_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "hospitals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hospital_drug_stock" ADD CONSTRAINT "hospital_drug_stock_drugId_fkey" FOREIGN KEY ("drugId") REFERENCES "medication_registry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "appointments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "triagevitals" ADD CONSTRAINT "triagevitals_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "appointments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hospital_invoices" ADD CONSTRAINT "hospital_invoices_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "appointments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hospital_invoices" ADD CONSTRAINT "hospital_invoices_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hospital_invoices" ADD CONSTRAINT "hospital_invoices_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "hospitals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hospital_invoice_items" ADD CONSTRAINT "hospital_invoice_items_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "hospital_invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hospital_configs" ADD CONSTRAINT "hospital_configs_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "hospitals"("id") ON DELETE CASCADE ON UPDATE CASCADE;
