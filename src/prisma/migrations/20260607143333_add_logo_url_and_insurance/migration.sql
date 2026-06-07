-- CreateEnum
CREATE TYPE "AppointmentType" AS ENUM ('ONLINE', 'IN_PERSON');

-- CreateEnum
CREATE TYPE "LeaveStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "appointments" ADD COLUMN     "telemedicineDuration" INTEGER,
ADD COLUMN     "type" "AppointmentType" NOT NULL DEFAULT 'IN_PERSON';

-- AlterTable
ALTER TABLE "doctors" ALTER COLUMN "firstName" DROP NOT NULL,
ALTER COLUMN "lastName" DROP NOT NULL;

-- AlterTable
ALTER TABLE "pharmacies" ADD COLUMN     "logoUrl" TEXT;

-- AlterTable
ALTER TABLE "prescriptions" ADD COLUMN     "qrCodeUrl" TEXT,
ADD COLUMN     "refillsAllowed" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "refillsRemaining" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "verificationHash" TEXT;

-- CreateTable
CREATE TABLE "doctor_leaves" (
    "id" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "LeaveStatus" NOT NULL DEFAULT 'PENDING',
    "affectedPatients" INTEGER NOT NULL DEFAULT 0,
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "doctor_leaves_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "telemedicine_session_logs" (
    "id" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "telemedicine_session_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "doctor_leaves_doctorId_idx" ON "doctor_leaves"("doctorId");

-- CreateIndex
CREATE INDEX "doctor_leaves_status_idx" ON "doctor_leaves"("status");

-- AddForeignKey
ALTER TABLE "doctor_leaves" ADD CONSTRAINT "doctor_leaves_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "doctors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "telemedicine_session_logs" ADD CONSTRAINT "telemedicine_session_logs_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "appointments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
