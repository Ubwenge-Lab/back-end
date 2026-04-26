/*
  Warnings:

  - Made the column `latitude` on table `branches` required. This step will fail if there are existing NULL values in that column.
  - Made the column `longitude` on table `branches` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "branches" ALTER COLUMN "latitude" SET NOT NULL,
ALTER COLUMN "longitude" SET NOT NULL;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true;
