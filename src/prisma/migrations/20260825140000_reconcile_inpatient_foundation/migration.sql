-- Earlier inpatient and ward features were merged with schema changes but no
-- migration. Reconcile that foundation before applying the bed lifecycle.
-- The guards also make this safe for databases that were previously synced
-- with `prisma db push`.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'AdmissionStatus') THEN
    CREATE TYPE "AdmissionStatus" AS ENUM ('ACTIVE', 'DISCHARGED', 'TRANSFERRED');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ShiftType') THEN
    CREATE TYPE "ShiftType" AS ENUM ('MORNING', 'AFTERNOON', 'NIGHT');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'WardTier') THEN
    CREATE TYPE "WardTier" AS ENUM ('GENERAL', 'ICU', 'MATERNITY', 'PEDIATRIC', 'PRIVATE');
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS "wards" (
  "id" TEXT NOT NULL,
  "hospitalId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "tier" "WardTier" NOT NULL,
  "baseBedCharge" DECIMAL(12,2) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "wards_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "beds" (
  "id" TEXT NOT NULL,
  "wardId" TEXT NOT NULL,
  "number" TEXT NOT NULL,
  "isOccupied" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "beds_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "inpatient_admissions" (
  "id" TEXT NOT NULL,
  "patientId" TEXT NOT NULL,
  "hospitalId" TEXT NOT NULL,
  "bedId" TEXT,
  "doctorId" TEXT,
  "admittedByUserId" TEXT NOT NULL,
  "admittedByName" TEXT NOT NULL,
  "admittedByRole" TEXT NOT NULL,
  "wardName" TEXT,
  "bedNumber" TEXT,
  "reason" TEXT NOT NULL,
  "status" "AdmissionStatus" NOT NULL DEFAULT 'ACTIVE',
  "admittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "dischargedAt" TIMESTAMP(3),
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "inpatient_admissions_pkey" PRIMARY KEY ("id")
);

-- Reconcile databases that received only the original admission feature.
ALTER TABLE "inpatient_admissions"
  ADD COLUMN IF NOT EXISTS "bedId" TEXT,
  ADD COLUMN IF NOT EXISTS "doctorId" TEXT,
  ADD COLUMN IF NOT EXISTS "notes" TEXT;

CREATE TABLE IF NOT EXISTS "inpatient_vitals" (
  "id" TEXT NOT NULL,
  "admissionId" TEXT NOT NULL,
  "recordedById" TEXT NOT NULL,
  "readings" JSONB NOT NULL,
  "checklist" JSONB NOT NULL,
  "nurseNotes" TEXT,
  "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "inpatient_vitals_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "mar_logs" (
  "id" TEXT NOT NULL,
  "admissionId" TEXT NOT NULL,
  "administeredById" TEXT NOT NULL,
  "medicationName" TEXT NOT NULL,
  "dose" TEXT NOT NULL,
  "route" TEXT,
  "prescriptionMedId" TEXT,
  "scheduledAt" TIMESTAMP(3),
  "administeredAt" TIMESTAMP(3) NOT NULL,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "mar_logs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "nursing_handovers" (
  "id" TEXT NOT NULL,
  "admissionId" TEXT NOT NULL,
  "handedOverById" TEXT NOT NULL,
  "receivedById" TEXT,
  "shiftType" "ShiftType" NOT NULL,
  "checklist" JSONB NOT NULL,
  "notes" TEXT,
  "handedOverAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "nursing_handovers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "supply_consumptions" (
  "id" TEXT NOT NULL,
  "admissionId" TEXT NOT NULL,
  "itemName" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL,
  "unitCost" DECIMAL(12,2) NOT NULL,
  "totalCost" DECIMAL(12,2) NOT NULL,
  "administeredBy" TEXT NOT NULL,
  "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "supply_consumptions_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "hospital_invoices"
  ALTER COLUMN "appointmentId" DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS "admissionId" TEXT;
ALTER TABLE "hospital_invoice_items"
  ADD COLUMN IF NOT EXISTS "category" TEXT,
  ADD COLUMN IF NOT EXISTS "pharmacyId" TEXT;

CREATE INDEX IF NOT EXISTS "wards_hospitalId_idx" ON "wards"("hospitalId");
CREATE INDEX IF NOT EXISTS "beds_wardId_idx" ON "beds"("wardId");
CREATE INDEX IF NOT EXISTS "inpatient_admissions_patientId_idx" ON "inpatient_admissions"("patientId");
CREATE INDEX IF NOT EXISTS "inpatient_admissions_hospitalId_idx" ON "inpatient_admissions"("hospitalId");
CREATE INDEX IF NOT EXISTS "inpatient_admissions_status_idx" ON "inpatient_admissions"("status");
CREATE INDEX IF NOT EXISTS "inpatient_vitals_admissionId_idx" ON "inpatient_vitals"("admissionId");
CREATE INDEX IF NOT EXISTS "inpatient_vitals_recordedAt_idx" ON "inpatient_vitals"("recordedAt");
CREATE INDEX IF NOT EXISTS "mar_logs_admissionId_idx" ON "mar_logs"("admissionId");
CREATE INDEX IF NOT EXISTS "mar_logs_administeredAt_idx" ON "mar_logs"("administeredAt");
CREATE INDEX IF NOT EXISTS "nursing_handovers_admissionId_idx" ON "nursing_handovers"("admissionId");
CREATE INDEX IF NOT EXISTS "supply_consumptions_admissionId_idx" ON "supply_consumptions"("admissionId");
CREATE UNIQUE INDEX IF NOT EXISTS "hospital_invoices_admissionId_key" ON "hospital_invoices"("admissionId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'wards_hospitalId_fkey' AND conrelid = '"wards"'::regclass) THEN
    ALTER TABLE "wards" ADD CONSTRAINT "wards_hospitalId_fkey"
      FOREIGN KEY ("hospitalId") REFERENCES "hospitals"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'beds_wardId_fkey' AND conrelid = '"beds"'::regclass) THEN
    ALTER TABLE "beds" ADD CONSTRAINT "beds_wardId_fkey"
      FOREIGN KEY ("wardId") REFERENCES "wards"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inpatient_admissions_patientId_fkey' AND conrelid = '"inpatient_admissions"'::regclass) THEN
    ALTER TABLE "inpatient_admissions" ADD CONSTRAINT "inpatient_admissions_patientId_fkey"
      FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inpatient_admissions_hospitalId_fkey' AND conrelid = '"inpatient_admissions"'::regclass) THEN
    ALTER TABLE "inpatient_admissions" ADD CONSTRAINT "inpatient_admissions_hospitalId_fkey"
      FOREIGN KEY ("hospitalId") REFERENCES "hospitals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inpatient_admissions_bedId_fkey' AND conrelid = '"inpatient_admissions"'::regclass) THEN
    ALTER TABLE "inpatient_admissions" ADD CONSTRAINT "inpatient_admissions_bedId_fkey"
      FOREIGN KEY ("bedId") REFERENCES "beds"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inpatient_admissions_doctorId_fkey' AND conrelid = '"inpatient_admissions"'::regclass) THEN
    ALTER TABLE "inpatient_admissions" ADD CONSTRAINT "inpatient_admissions_doctorId_fkey"
      FOREIGN KEY ("doctorId") REFERENCES "doctors"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inpatient_vitals_admissionId_fkey' AND conrelid = '"inpatient_vitals"'::regclass) THEN
    ALTER TABLE "inpatient_vitals" ADD CONSTRAINT "inpatient_vitals_admissionId_fkey"
      FOREIGN KEY ("admissionId") REFERENCES "inpatient_admissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inpatient_vitals_recordedById_fkey' AND conrelid = '"inpatient_vitals"'::regclass) THEN
    ALTER TABLE "inpatient_vitals" ADD CONSTRAINT "inpatient_vitals_recordedById_fkey"
      FOREIGN KEY ("recordedById") REFERENCES "hospital_staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'mar_logs_admissionId_fkey' AND conrelid = '"mar_logs"'::regclass) THEN
    ALTER TABLE "mar_logs" ADD CONSTRAINT "mar_logs_admissionId_fkey"
      FOREIGN KEY ("admissionId") REFERENCES "inpatient_admissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'mar_logs_administeredById_fkey' AND conrelid = '"mar_logs"'::regclass) THEN
    ALTER TABLE "mar_logs" ADD CONSTRAINT "mar_logs_administeredById_fkey"
      FOREIGN KEY ("administeredById") REFERENCES "hospital_staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'nursing_handovers_admissionId_fkey' AND conrelid = '"nursing_handovers"'::regclass) THEN
    ALTER TABLE "nursing_handovers" ADD CONSTRAINT "nursing_handovers_admissionId_fkey"
      FOREIGN KEY ("admissionId") REFERENCES "inpatient_admissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'nursing_handovers_handedOverById_fkey' AND conrelid = '"nursing_handovers"'::regclass) THEN
    ALTER TABLE "nursing_handovers" ADD CONSTRAINT "nursing_handovers_handedOverById_fkey"
      FOREIGN KEY ("handedOverById") REFERENCES "hospital_staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'nursing_handovers_receivedById_fkey' AND conrelid = '"nursing_handovers"'::regclass) THEN
    ALTER TABLE "nursing_handovers" ADD CONSTRAINT "nursing_handovers_receivedById_fkey"
      FOREIGN KEY ("receivedById") REFERENCES "hospital_staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'supply_consumptions_admissionId_fkey' AND conrelid = '"supply_consumptions"'::regclass) THEN
    ALTER TABLE "supply_consumptions" ADD CONSTRAINT "supply_consumptions_admissionId_fkey"
      FOREIGN KEY ("admissionId") REFERENCES "inpatient_admissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'hospital_invoices_admissionId_fkey' AND conrelid = '"hospital_invoices"'::regclass) THEN
    ALTER TABLE "hospital_invoices" ADD CONSTRAINT "hospital_invoices_admissionId_fkey"
      FOREIGN KEY ("admissionId") REFERENCES "inpatient_admissions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END
$$;
