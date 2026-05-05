/*
  Warnings:
  - Made the column `latitude` on table `pharmacies` required.
*/

-- Block the migration if NULL coordinates exist
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM "pharmacies" WHERE "latitude" IS NULL OR "longitude" IS NULL) THEN
        RAISE EXCEPTION 'Migration Failed: Found pharmacies with NULL coordinates. Please manually update these rows with valid Kigali coordinates before running this migration.';
    END IF;
END $$;

-- If we get past the block above, it means data is clean
ALTER TABLE "pharmacies" ALTER COLUMN "latitude" SET NOT NULL,
ALTER COLUMN "longitude" SET NOT NULL;
