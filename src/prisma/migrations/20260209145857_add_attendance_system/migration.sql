-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM ('CLOCKED_IN', 'CLOCKED_OUT', 'PENDING_CLOCK_IN', 'PENDING_CLOCK_OUT', 'REJECTED');

-- CreateTable
CREATE TABLE "attendance" (
    "id" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "clockInTime" TIMESTAMP(3),
    "clockInLocation" JSONB,
    "clockInApproved" BOOLEAN NOT NULL DEFAULT false,
    "clockInStatus" "AttendanceStatus" NOT NULL DEFAULT 'PENDING_CLOCK_IN',
    "clockOutTime" TIMESTAMP(3),
    "clockOutLocation" JSONB,
    "clockOutApproved" BOOLEAN NOT NULL DEFAULT false,
    "clockOutStatus" "AttendanceStatus",
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "totalHours" DOUBLE PRECISION,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attendance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "attendance_staffId_idx" ON "attendance"("staffId");

-- CreateIndex
CREATE INDEX "attendance_branchId_idx" ON "attendance"("branchId");

-- CreateIndex
CREATE INDEX "attendance_clockInTime_idx" ON "attendance"("clockInTime");

-- CreateIndex
CREATE INDEX "attendance_clockInStatus_idx" ON "attendance"("clockInStatus");

-- AddForeignKey
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_approvedBy_fkey" FOREIGN KEY ("approvedBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
