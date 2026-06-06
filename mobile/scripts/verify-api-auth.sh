#!/usr/bin/env bash
# Confirms mobile Supabase JWTs are accepted by EXPO_PUBLIC_CARD_SCAN_API_URL.
set -euo pipefail

cd "$(dirname "$0")/.."
if [[ -f .env ]]; then set -a; source .env; set +a; fi

: "${EXPO_PUBLIC_SUPABASE_URL:?}"
: "${EXPO_PUBLIC_SUPABASE_ANON_KEY:?}"
: "${EXPO_PUBLIC_CARD_SCAN_API_URL:?}"

read -r -p "Test email: " EMAIL
read -r -s -p "Password: " PASSWORD
echo

TOKEN="$(
  curl -sf "${EXPO_PUBLIC_SUPABASE_URL%/}/auth/v1/token?grant_type=password" \
    -H "apikey: ${EXPO_PUBLIC_SUPABASE_ANON_KEY}" \
    -H "Authorization: Bearer ${EXPO_PUBLIC_SUPABASE_ANON_KEY}" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"${EMAIL}\",\"password\":\"${PASSWORD}\"}" \
    | python3 -c "import json,sys; print(json.load(sys.stdin).get('access_token',''))"
)"

if [[ -z "$TOKEN" ]]; then
  echo "Sign-in failed (check email/password or email confirmation)."
  exit 1
fi

USER_STATUS="$(
  curl -s -o /dev/null -w "%{http_code}" \
    "${EXPO_PUBLIC_SUPABASE_URL%/}/auth/v1/user" \
    -H "apikey: ${EXPO_PUBLIC_SUPABASE_ANON_KEY}" \
    -H "Authorization: Bearer ${TOKEN}"
)"

API_STATUS="$(
  curl -s -o /dev/null -w "%{http_code}" \
    "${EXPO_PUBLIC_CARD_SCAN_API_URL%/}/scan" \
    -H "Authorization: Bearer ${TOKEN}" \
    -X POST \
    -d "x"
)"

echo "Supabase /user: HTTP ${USER_STATUS} (expect 200)"
echo "Card-scan API /scan: HTTP ${API_STATUS} (expect 400/422 for bad body, NOT 401)"

if [[ "$USER_STATUS" == "200" && "$API_STATUS" == "401" ]]; then
  echo ""
  echo "MISMATCH: JWT is valid for Supabase but rejected by the scan API."
  echo "Run: GCP_PROJECT=your-project infra/gcp/sync_supabase_from_mobile_env.sh"
  exit 1
fi

echo "Auth alignment looks OK."
