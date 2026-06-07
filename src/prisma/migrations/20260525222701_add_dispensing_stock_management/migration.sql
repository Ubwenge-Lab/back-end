-- CreateEnum
CREATE TYPE "DispenseStatus" AS ENUM ('PENDING', 'HOSPITAL_DISPENSED', 'DISPATCHED_TO_PHARMACY', 'FULFILLED');

-- AlterTable
ALTER TABLE "hospital_drug_stock" ADD COLUMN     "reorderLevel" INTEGER NOT NULL DEFAULT 10;

-- AlterTable
ALTER TABLE "hospital_invoice_items" ADD COLUMN     "category" TEXT,
ADD COLUMN     "pharmacyId" TEXT;

-- AlterTable
ALTER TABLE "prescription_medications" ADD COLUMN     "dispenseStatus" "DispenseStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "fulfilledAt" TIMESTAMP(3),
ADD COLUMN     "hospitalDrugStockDrugId" TEXT,
ADD COLUMN     "hospitalDrugStockHospitalId" TEXT,
ADD COLUMN     "isHospitalMed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "pharmacyId" TEXT;

-- AlterTable
ALTER TABLE "prescriptions" ADD COLUMN     "dispatchedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "hospital_drug_stock_hospitalId_idx" ON "hospital_drug_stock"("hospitalId");

-- AddForeignKey
ALTER TABLE "prescription_medications" ADD CONSTRAINT "prescription_medications_hospitalDrugStockDrugId_hospitalD_fkey" FOREIGN KEY ("hospitalDrugStockDrugId", "hospitalDrugStockHospitalId") REFERENCES "hospital_drug_stock"("drugId", "hospitalId") ON DELETE SET NULL ON UPDATE CASCADE;
