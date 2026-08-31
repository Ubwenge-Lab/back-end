-- Replace the minimal "staff_leaves" module (added in 20260823100000_add_staff_leave)
-- with the full leave-request / leave-balance system covering all leave
-- categories recognised under Rwanda's labour law and the
-- staff -> branch manager -> pharmacy owner approval hierarchy.

-- DropForeignKey
ALTER TABLE "staff_leaves" DROP CONSTRAINT IF EXISTS "staff_leaves_staffId_fkey";
ALTER TABLE "staff_leaves" DROP CONSTRAINT IF EXISTS "staff_leaves_branchId_fkey";

-- DropTable
DROP TABLE IF EXISTS "staff_leaves";

-- AlterEnum: add the remaining Rwanda labour-law leave categories
ALTER TYPE "LeaveType" ADD VALUE IF NOT EXISTS 'MATERNITY';
ALTER TYPE "LeaveType" ADD VALUE IF NOT EXISTS 'PATERNITY';
ALTER TYPE "LeaveType" ADD VALUE IF NOT EXISTS 'CIRCUMSTANTIAL';
ALTER TYPE "LeaveType" ADD VALUE IF NOT EXISTS 'MARRIAGE';

-- AlterEnum: allow requesters to cancel their own pending leave request
ALTER TYPE "LeaveStatus" ADD VALUE IF NOT EXISTS 'CANCELLED';

-- CreateTable
CREATE TABLE "leave_requests" (
    "id" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "requesterRole" "UserRole" NOT NULL,
    "branchId" TEXT,
    "pharmacyId" TEXT NOT NULL,
    "leaveType" "LeaveType" NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "totalDays" DOUBLE PRECISION NOT NULL,
    "reason" TEXT NOT NULL,
    "attachmentUrl" TEXT,
    "status" "LeaveStatus" NOT NULL DEFAULT 'PENDING',
    "reviewerId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leave_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_balances" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "leaveType" "LeaveType" NOT NULL DEFAULT 'ANNUAL',
    "allocatedDays" DOUBLE PRECISION NOT NULL,
    "usedDays" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "setById" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leave_balances_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "leave_requests_requesterId_idx" ON "leave_requests"("requesterId");
CREATE INDEX "leave_requests_branchId_idx" ON "leave_requests"("branchId");
CREATE INDEX "leave_requests_pharmacyId_idx" ON "leave_requests"("pharmacyId");
CREATE INDEX "leave_requests_status_idx" ON "leave_requests"("status");

-- CreateIndex
CREATE INDEX "leave_balances_userId_idx" ON "leave_balances"("userId");
CREATE UNIQUE INDEX "leave_balances_userId_year_leaveType_key" ON "leave_balances"("userId", "year", "leaveType");

-- AddForeignKey
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_balances" ADD CONSTRAINT "leave_balances_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "leave_balances" ADD CONSTRAINT "leave_balances_setById_fkey" FOREIGN KEY ("setById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
