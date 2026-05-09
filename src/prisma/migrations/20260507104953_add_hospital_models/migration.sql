-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "UserRole" ADD VALUE 'HOSPITAL_ADMIN';
ALTER TYPE "UserRole" ADD VALUE 'DOCTOR';
ALTER TYPE "UserRole" ADD VALUE 'RECEPTIONIST';
ALTER TYPE "UserRole" ADD VALUE 'NURSE';

-- CreateTable
CREATE TABLE "hospitals" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "representativeName" TEXT,
    "address" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "dateOfIncorporation" TIMESTAMP(3),
    "rdbCertificate" TEXT,
    "pharmacyLicense" TEXT,
    "businessRegistration" TEXT,
    "status" "PharmacyStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hospitals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hospital_staff" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "hospitalId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "phone" TEXT,
    "status" "StaffStatus" NOT NULL DEFAULT 'ACTIVE',
    "tempPasswordHash" TEXT,
    "tempPasswordExpiry" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hospital_staff_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "hospitals_userId_key" ON "hospitals"("userId");

-- CreateIndex
CREATE INDEX "hospitals_userId_idx" ON "hospitals"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "hospital_staff_userId_key" ON "hospital_staff"("userId");

-- CreateIndex
CREATE INDEX "hospital_staff_hospitalId_idx" ON "hospital_staff"("hospitalId");

-- AddForeignKey
ALTER TABLE "hospitals" ADD CONSTRAINT "hospitals_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hospital_staff" ADD CONSTRAINT "hospital_staff_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "hospitals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hospital_staff" ADD CONSTRAINT "hospital_staff_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
