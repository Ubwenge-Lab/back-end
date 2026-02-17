-- CreateTable
CREATE TABLE "medication_registry" (
    "id" TEXT NOT NULL,
    "registrationNumber" TEXT NOT NULL,
    "brandName" TEXT NOT NULL,
    "genericName" TEXT NOT NULL,
    "dosageStrength" TEXT NOT NULL,
    "dosageForm" TEXT NOT NULL,
    "packSize" TEXT NOT NULL,
    "packagingType" TEXT NOT NULL,
    "shelfLife" TEXT NOT NULL,
    "manufacturerName" TEXT NOT NULL,
    "manufacturerAddress" TEXT NOT NULL,
    "manufacturerCountry" TEXT NOT NULL,
    "marketingAuthHolder" TEXT,
    "localTechRep" TEXT,
    "registrationDate" TIMESTAMP(3) NOT NULL,
    "expiryDate" TIMESTAMP(3),

    CONSTRAINT "medication_registry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "medication_registry_registrationNumber_key" ON "medication_registry"("registrationNumber");

-- CreateIndex
CREATE INDEX "medication_registry_brandName_idx" ON "medication_registry"("brandName");

-- CreateIndex
CREATE INDEX "medication_registry_genericName_idx" ON "medication_registry"("genericName");

-- CreateIndex
CREATE INDEX "medication_registry_registrationNumber_idx" ON "medication_registry"("registrationNumber");

-- AlterTable
ALTER TABLE "Medication" ADD COLUMN "registryId" TEXT;

-- AddForeignKey
ALTER TABLE "Medication" ADD CONSTRAINT "Medication_registryId_fkey" FOREIGN KEY ("registryId") REFERENCES "medication_registry"("id") ON DELETE SET NULL ON UPDATE CASCADE;
