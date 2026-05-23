-- Add receiptNumber to the payments table
ALTER TABLE "payments" ADD COLUMN "receiptNumber" text;
CREATE UNIQUE INDEX "payments_receiptNumber_key" ON "payments" ("receiptNumber");
