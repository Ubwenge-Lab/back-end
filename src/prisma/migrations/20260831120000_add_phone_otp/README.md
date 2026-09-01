# `add_phone_otp` — NOT YET APPLIED

This migration was written but **never run**. `DATABASE_URL` in this checkout
points at the live Supabase instance that real users are on, so nothing was
applied from the machine that authored it. The only Prisma command run here was
`prisma generate`, which reads the schema file and does not connect.

## What it does

Additive only — it creates new things and never touches existing rows:

| Statement | Effect |
|---|---|
| `CREATE TYPE "OtpPurpose"` | new enum |
| `ALTER TABLE "users" ADD COLUMN "verifiedPhone" TEXT` | new **nullable** column, no default |
| `ALTER TABLE "users" ADD COLUMN "phoneVerifiedAt" TIMESTAMP(3)` | new **nullable** column, no default |
| `CREATE TABLE "phone_otps"` | new table |
| 3 × `CREATE INDEX` | on the new table only |
| `ADD CONSTRAINT ... FOREIGN KEY` | on the new table only |

No `DROP`, no `ALTER COLUMN`, no `UPDATE`, no `NOT NULL` backfill. Both new
columns are nullable with no default, so Postgres adds them as metadata-only
changes rather than rewriting the `users` table. Existing reads and writes are
unaffected, and older application builds keep working because nothing they
select or insert has changed.

## How to apply it safely

1. Apply to a **non-production database first** — a Supabase branch, a restored
   snapshot, or a local Postgres — and run `npx jest src/otp` plus a manual
   request/verify round trip against it.
2. Confirm the target's migration history is in step:
   `npx prisma migrate status --schema=src/prisma/schema.prisma`.
   This repo has a complete history from `20260325155832_init`, so
   `migrate deploy` is the supported path — but check `status` first rather
   than assuming, because a database that has ever been touched by
   `prisma db push` can be schema-correct and history-inconsistent at the same
   time.
3. Only then: `npx prisma migrate deploy --schema=src/prisma/schema.prisma`.

**Never** run `prisma migrate dev` or `prisma db push` against the shared
database. `migrate dev` can reset it, and `db push` can drop columns it thinks
are unwanted. Neither asks twice.

## Rolling back

Additive, so the down path is a plain drop — but only if nothing has written to
it yet:

```sql
DROP TABLE IF EXISTS "phone_otps";
ALTER TABLE "users" DROP COLUMN IF EXISTS "verifiedPhone";
ALTER TABLE "users" DROP COLUMN IF EXISTS "phoneVerifiedAt";
DROP TYPE IF EXISTS "OtpPurpose";
```

Dropping `verifiedPhone` / `phoneVerifiedAt` after users have verified numbers
loses that evidence and they would have to verify again.
