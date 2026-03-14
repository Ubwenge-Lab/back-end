/*
  Warnings:

  - The values [INVITED] on the enum `BranchStatus` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "BranchStatus_new" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED');
ALTER TABLE "public"."branches" ALTER COLUMN "branchStatus" DROP DEFAULT;
ALTER TABLE "branches" ALTER COLUMN "branchStatus" TYPE "BranchStatus_new" USING ("branchStatus"::text::"BranchStatus_new");
ALTER TYPE "BranchStatus" RENAME TO "BranchStatus_old";
ALTER TYPE "BranchStatus_new" RENAME TO "BranchStatus";
DROP TYPE "public"."BranchStatus_old";
ALTER TABLE "branches" ALTER COLUMN "branchStatus" SET DEFAULT 'PENDING';
COMMIT;

-- DropIndex
DROP INDEX "users_email_idx";

-- AlterTable
ALTER TABLE "branches" ALTER COLUMN "branchStatus" SET DEFAULT 'PENDING';

-- AlterTable
ALTER TABLE "staff" ADD COLUMN     "phone" TEXT;

-- AlterTable
ALTER TABLE "staff_permissions" ALTER COLUMN "permissions" SET DEFAULT ARRAY[]::TEXT[];
