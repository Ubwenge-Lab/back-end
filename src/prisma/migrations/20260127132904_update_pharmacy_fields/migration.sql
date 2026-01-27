/*
  Warnings:

  - You are about to drop the column `licenseDocument` on the `pharmacies` table. All the data in the column will be lost.
  - You are about to drop the column `licenseNumber` on the `pharmacies` table. All the data in the column will be lost.
  - Added the required column `dateOfIncorporation` to the `pharmacies` table without a default value. This is not possible if the table is not empty.
  - Added the required column `pharmacyLicense` to the `pharmacies` table without a default value. This is not possible if the table is not empty.
  - Added the required column `rdbCertificate` to the `pharmacies` table without a default value. This is not possible if the table is not empty.
  - Added the required column `representativeName` to the `pharmacies` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "pharmacies_licenseNumber_key";

-- AlterTable
ALTER TABLE "pharmacies" DROP COLUMN "licenseDocument",
DROP COLUMN "licenseNumber",
ADD COLUMN     "dateOfIncorporation" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "pharmacyLicense" TEXT NOT NULL,
ADD COLUMN     "rdbCertificate" TEXT NOT NULL,
ADD COLUMN     "representativeName" TEXT NOT NULL;
