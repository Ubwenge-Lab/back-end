# Remediation — Oversized Payload / Storage DoS

## Priority: P3

### 1. Add role checks to upload endpoints
- `/upload/license` → PHARMACY / BRANCH_MANAGER only.
- `/upload/prescription` → PATIENT only (with per-user rate limit).
- `/upload/medication-image` → PHARMACY / PHARMACIST / BRANCH_MANAGER only.

### 2. Tighten limits
1. Body limit: 50 MB → 10 MB (files already capped at 10 MB per file, but
   the JSON path doesn't need 50 MB).
2. Per-user upload quotas (e.g. X MB/day) and a daily rate limit.
3. Set multer `limits: { fileSize: 10*1024*1024, files: 1, fields: 10 }`.

### 3. Stop storing blobs in Postgres (architecture)
1. Move uploads to object storage (S3/R2/Supabase Storage) and store only the
   object key/URL.
2. If data-URI storage must remain short-term, add a scheduled cleanup job
   for orphaned blobs.

### 4. Platform hardening
- Set Render instance memory alerts; consider a WAF that caps request bodies
  before they reach the app.

### Acceptance criteria
- [ ] Upload endpoints enforce roles
- [ ] Body limit reduced; per-user quota enforced
- [ ] Blobs stored in object storage (or cleanup job active)
