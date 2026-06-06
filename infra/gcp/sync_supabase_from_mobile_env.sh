#!/usr/bin/env bash
# Point card-scan-api at the same Supabase project as card_scan/mobile/.env.
set -euo pipefail

: "${GCP_PROJECT:?Set GCP_PROJECT}"

REGION="${REGION:-us-central1}"
SERVICE="${API_SERVICE:-card-scan-api}"

# shellcheck source=load_mobile_supabase_env.sh
source "$(dirname "$0")/load_mobile_supabase_env.sh"

echo "Updating $SERVICE (region=$REGION) from $MOBILE_ENV_FILE"
echo "  Supabase host: $(python3 -c "from urllib.parse import urlparse; print(urlparse('${SUPABASE_URL}').hostname)")"

printf '%s' "$SUPABASE_ANON_KEY" | gcloud secrets versions add SUPABASE_ANON_KEY \
  --project="$GCP_PROJECT" \
  --data-file=-

gcloud run services update "$SERVICE" \
  --project="$GCP_PROJECT" \
  --region="$REGION" \
  --update-env-vars="SUPABASE_URL=${SUPABASE_URL},AUTH_MODE=required"

echo "Done. Verify with: make verify-api-auth"
