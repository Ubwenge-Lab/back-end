-- Migration: add lastLat and lastLng to patients table
-- These columns were added directly to the DB 
-- This migration file records them so Prisma migration history stays in sync.

ALTER TABLE "patients" ADD COLUMN IF NOT EXISTS "lastLat" DOUBLE PRECISION;
ALTER TABLE "patients" ADD COLUMN IF NOT EXISTS "lastLng" DOUBLE PRECISION;
