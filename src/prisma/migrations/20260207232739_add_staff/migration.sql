-- AlterEnum
ALTER TYPE "UserRole" ADD VALUE 'NURSE';

-- AlterTable
ALTER TABLE "staff" ADD COLUMN     "tempPasswordExpiry" TIMESTAMP(3),
ADD COLUMN     "tempPasswordHash" TEXT;

-- CreateTable
CREATE TABLE "staff_permissions" (
    "id" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "permissions" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "staff_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "staff_permissions_staffId_key" ON "staff_permissions"("staffId");

-- CreateIndex
CREATE INDEX "staff_permissions_staffId_idx" ON "staff_permissions"("staffId");

-- AddForeignKey
ALTER TABLE "staff_permissions" ADD CONSTRAINT "staff_permissions_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;
