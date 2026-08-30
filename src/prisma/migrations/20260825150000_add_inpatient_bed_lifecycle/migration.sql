-- Add the explicit bed lifecycle used by admissions and transfers.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'BedStatus') THEN
    CREATE TYPE "BedStatus" AS ENUM (
      'AVAILABLE',
      'OCCUPIED',
      'MAINTENANCE',
      'CLEANING'
    );
  END IF;
END
$$;

ALTER TABLE "inpatient_admissions"
  ADD COLUMN IF NOT EXISTS "billingCleared" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "clinicalCleared" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "dischargeNotes" TEXT,
  ADD COLUMN IF NOT EXISTS "dischargedByUserId" TEXT;

ALTER TABLE "beds"
  ADD COLUMN IF NOT EXISTS "roomId" TEXT,
  ADD COLUMN IF NOT EXISTS "status" "BedStatus" NOT NULL DEFAULT 'AVAILABLE',
  ADD COLUMN IF NOT EXISTS "statusNotes" TEXT;

-- An admission may never control another hospital's bed. Preserve the
-- clinical admission while removing only the invalid physical assignment.
UPDATE "inpatient_admissions" AS admission
SET "bedId" = NULL
FROM "beds" AS bed
JOIN "wards" AS ward ON ward."id" = bed."wardId"
WHERE admission."bedId" = bed."id"
  AND admission."hospitalId" <> ward."hospitalId";

-- Preserve the newest active assignment if a legacy race linked more than
-- one active admission to the same bed; unassign the other admissions.
WITH ranked_assignments AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "bedId"
      ORDER BY "admittedAt" DESC, "id" DESC
    ) AS assignment_rank
  FROM "inpatient_admissions"
  WHERE "status" = 'ACTIVE' AND "bedId" IS NOT NULL
)
UPDATE "inpatient_admissions" AS admission
SET "bedId" = NULL
FROM ranked_assignments
WHERE admission."id" = ranked_assignments."id"
  AND ranked_assignments.assignment_rank > 1;

-- Preserve legacy occupancy and reconcile it with assigned active admissions.
UPDATE "beds" AS bed
SET "status" = CASE
  WHEN bed."isOccupied" OR EXISTS (
    SELECT 1
    FROM "inpatient_admissions" AS admission
    WHERE admission."bedId" = bed."id"
      AND admission."status" = 'ACTIVE'
  ) THEN 'OCCUPIED'::"BedStatus"
  ELSE 'AVAILABLE'::"BedStatus"
END,
"isOccupied" = bed."isOccupied" OR EXISTS (
  SELECT 1
  FROM "inpatient_admissions" AS admission
  WHERE admission."bedId" = bed."id"
    AND admission."status" = 'ACTIVE'
);

-- Keep the legacy boolean and the new enum from diverging.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'beds_status_occupied_consistency_check'
      AND conrelid = '"beds"'::regclass
  ) THEN
    ALTER TABLE "beds"
      ADD CONSTRAINT "beds_status_occupied_consistency_check"
      CHECK (("status" = 'OCCUPIED') = "isOccupied");
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS "rooms" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "wardId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "rooms_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "bed_transfers" (
  "id" TEXT NOT NULL,
  "admissionId" TEXT NOT NULL,
  "fromBedId" TEXT,
  "toBedId" TEXT NOT NULL,
  "transferredByUserId" TEXT NOT NULL,
  "reason" TEXT,
  "transferredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "bed_transfers_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "rooms_wardId_idx" ON "rooms"("wardId");
CREATE UNIQUE INDEX IF NOT EXISTS "rooms_wardId_name_key" ON "rooms"("wardId", "name");
CREATE INDEX IF NOT EXISTS "bed_transfers_admissionId_idx" ON "bed_transfers"("admissionId");
CREATE INDEX IF NOT EXISTS "bed_transfers_fromBedId_idx" ON "bed_transfers"("fromBedId");
CREATE INDEX IF NOT EXISTS "bed_transfers_toBedId_idx" ON "bed_transfers"("toBedId");
CREATE INDEX IF NOT EXISTS "bed_transfers_transferredAt_idx" ON "bed_transfers"("transferredAt");
CREATE INDEX IF NOT EXISTS "inpatient_admissions_bedId_idx" ON "inpatient_admissions"("bedId");

-- Database-level protection for the two active-admission invariants.
-- Refuse to guess which clinical record is authoritative if legacy data is
-- already inconsistent; operators must reconcile those records explicitly.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "inpatient_admissions"
    WHERE "status" = 'ACTIVE' AND "bedId" IS NOT NULL
    GROUP BY "bedId"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot install bed lifecycle: duplicate active admissions share a bed';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM "inpatient_admissions"
    WHERE "status" = 'ACTIVE'
    GROUP BY "patientId", "hospitalId"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot install bed lifecycle: duplicate active admissions exist for a patient and hospital';
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS "inpatient_admissions_active_bed_key"
  ON "inpatient_admissions"("bedId")
  WHERE "status" = 'ACTIVE' AND "bedId" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "inpatient_admissions_active_patient_hospital_key"
  ON "inpatient_admissions"("patientId", "hospitalId")
  WHERE "status" = 'ACTIVE';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'beds_roomId_fkey' AND conrelid = '"beds"'::regclass) THEN
    ALTER TABLE "beds" ADD CONSTRAINT "beds_roomId_fkey"
      FOREIGN KEY ("roomId") REFERENCES "rooms"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rooms_wardId_fkey' AND conrelid = '"rooms"'::regclass) THEN
    ALTER TABLE "rooms" ADD CONSTRAINT "rooms_wardId_fkey"
      FOREIGN KEY ("wardId") REFERENCES "wards"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bed_transfers_admissionId_fkey' AND conrelid = '"bed_transfers"'::regclass) THEN
    ALTER TABLE "bed_transfers" ADD CONSTRAINT "bed_transfers_admissionId_fkey"
      FOREIGN KEY ("admissionId") REFERENCES "inpatient_admissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bed_transfers_fromBedId_fkey' AND conrelid = '"bed_transfers"'::regclass) THEN
    ALTER TABLE "bed_transfers" ADD CONSTRAINT "bed_transfers_fromBedId_fkey"
      FOREIGN KEY ("fromBedId") REFERENCES "beds"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bed_transfers_toBedId_fkey' AND conrelid = '"bed_transfers"'::regclass) THEN
    ALTER TABLE "bed_transfers" ADD CONSTRAINT "bed_transfers_toBedId_fkey"
      FOREIGN KEY ("toBedId") REFERENCES "beds"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END
$$;
