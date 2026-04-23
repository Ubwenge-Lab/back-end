-- AlterTable
ALTER TABLE "pharmacies" ADD COLUMN     "isLocationVerified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "locationVerifiedAt" TIMESTAMP(3);
