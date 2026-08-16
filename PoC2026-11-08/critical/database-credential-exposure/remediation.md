# Remediation — Database Credential Exposure

## Priority: P0 — do this immediately

### 1. Rotate all credentials (assume full compromise)
1. **Rotate the Supabase DB password** (and the Neon password) via the cloud
   console. The old passwords must stop working immediately.
2. **Rotate every application secret** that lived in `.env` / `.env.example`:
   - `DATABASE_URL` / `DIRECT_URL`
   - `JWT_SECRET`, `JWT_REFRESH_SECRET`
   - `SUPER_ADMIN_PASSWORD`
   - `RESEND_API_KEY`, `GEMINI_API_KEY`, Flutterwave keys
3. After rotation, re-run `exploit.sh` with the old URL and confirm it now fails.

### 2. Remove secrets from git history
1. `git filter-repo` (or `filter-branch`) to purge `.env.example` contents from
   **every commit**, then force-push all branches/tags.
2. Enable GitHub secret scanning / push protection on the org.
3. Optionally squash the repo history (it is your own project).

### 3. Move secrets to a secrets manager
1. Store all secrets in the hosting platform's secret store (Render env vars)
   or a vault (AWS Secrets Manager / Doppler / 1Password).
2. **Never commit real values.** `.env.example` must contain only
   `your-...` placeholders.
3. Add a pre-commit hook (e.g. `gitleaks`, `trufflehog`) that blocks commits
   containing high-entropy strings / known key formats (`npg_`, `re_`, etc.).

### 4. Harden database access (defense in depth)
1. **IP allow-list** the pooler to only the app's egress IPs (Render service
   IPs). Reject connections from the public internet.
2. Create a **least-privilege role** for the app (no DDL, no `pg_dump`,
   only the tables it needs) instead of the `postgres` superuser.
3. Enable **connection pooling limits** and audit logging on the pooler.
4. Consider moving to a private/VPC network if the platform supports it.

### 5. Incident response
1. Since the DB was accessible, assume the following may be exfiltrated:
   - all user PII (patients: names, phones, addresses, insurance details)
   - all payment records and order history
   - bcrypt password hashes (verify with a breach-notification tool if legally
     required — e.g., Rwandan data-protection law / GDPR analogues)
2. Force password reset for all users (the hashes may be offline-crackable).
3. Document the timeline and the data-at-risk for your records.

### Acceptance criteria
- [ ] `exploit.sh` fails with the old `DATABASE_URL`
- [ ] `git log -p` shows no secrets in any commit
- [ ] `.env.example` contains only placeholders
- [ ] DB pooler rejects connections from unknown IPs
- [ ] App runs with a least-privilege DB role
