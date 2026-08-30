-- AlterEnum
ALTER TYPE "TransferStatus" ADD VALUE 'CANCELLED';

-- AlterTable
ALTER TABLE "stock_transfers" ADD COLUMN     "stockDeducted" BOOLEAN NOT NULL DEFAULT false;

-- Backfill: transfers created before this fix had sender stock deducted at
-- creation time (PENDING). Mark them so REJECT/CANCEL still restore stock.
UPDATE "stock_transfers" SET "stockDeducted" = true WHERE "status" IN ('PENDING', 'APPROVED', 'SHIPPED');
