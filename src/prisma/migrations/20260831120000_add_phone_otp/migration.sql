-- Phone OTP: prove control of a phone number for an already-identified account.
--
-- Phone numbers are not unique anywhere in this schema (shared handsets are
-- common in RW/UG), so this is never a login credential: the caller identifies
-- the account by email and the code only proves they hold the number.

-- CreateEnum
CREATE TYPE "OtpPurpose" AS ENUM ('PHONE_VERIFICATION');

-- AlterTable: evidence of a proven number, kept apart from the editable
-- profile phone fields on patients/pharmacies/doctors/staff.
ALTER TABLE "users" ADD COLUMN     "verifiedPhone" TEXT,
                    ADD COLUMN     "phoneVerifiedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "phone_otps" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "purpose" "OtpPurpose" NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "consumedAt" TIMESTAMP(3),
    "lastSentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "phone_otps_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "phone_otps_userId_purpose_idx" ON "phone_otps"("userId", "purpose");

-- CreateIndex
CREATE INDEX "phone_otps_phone_idx" ON "phone_otps"("phone");

-- CreateIndex: lets a sweep of dead codes stay cheap.
CREATE INDEX "phone_otps_expiresAt_idx" ON "phone_otps"("expiresAt");

-- AddForeignKey
ALTER TABLE "phone_otps" ADD CONSTRAINT "phone_otps_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
