/*
  Warnings:

  - Made the column `latitude` on table `pharmacies` required. This step will fail if there are existing NULL values in that column.
  - Made the column `longitude` on table `pharmacies` required. This step will fail if there are existing NULL values in that column.

*/

-- 1. Patch the existing NULL values first
UPDATE "pharmacies" SET "latitude" = 0, "longitude" = 0 WHERE "latitude" IS NULL;

-- 2. Now apply the constraint
ALTER TABLE "pharmacies" ALTER COLUMN "latitude" SET NOT NULL,
ALTER COLUMN "longitude" SET NOT NULL;
