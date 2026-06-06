#!/usr/bin/env bash
# Post-deploy: wire secrets, env vars, IAM, optional scheduler, smoke test.
set -euo pipefail

: "${GCP_PROJECT:?Set GCP_PROJECT}"
REGION="${REGION:-us-central1}"
API_SERVICE="${API_SERVICE:-card-scan-api}"
VISION_SERVICE="${VISION_SERVICE:-card-scan-vision}"
API_SA="card-scan-api@${GCP_PROJECT}.iam.gserviceaccount.com"

gcloud config set project "$GCP_PROJECT"

API_URL="$(gcloud run services describe "$API_SERVICE" \
  --region="$REGION" --project="$GCP_PROJECT" \
  --format='value(status.url)')"
VISION_URL="$(gcloud run services describe "$VISION_SERVICE" \
  --region="$REGION" --project="$GCP_PROJECT" \
  --format='value(status.url)' 2>/dev/null || true)"

if [[ -z "$API_URL" ]]; then
  echo "ERROR: $API_SERVICE not found in $REGION"
  exit 1
fi

echo "API URL:    $API_URL"
echo "Vision URL: ${VISION_URL:-not deployed}"

# Secrets (ensure accessor IAM + update vision URL if vision exists)
"$(dirname "$0")/secrets.sh"

if [[ -n "$VISION_URL" ]]; then
  echo -n "$VISION_URL" | gcloud secrets versions add VISION_INTERNAL_URL \
    --project="$GCP_PROJECT" --data-file=-
  echo "Updated VISION_INTERNAL_URL secret"

  gcloud run services add-iam-policy-binding "$VISION_SERVICE" \
    --region="$REGION" \
    --project="$GCP_PROJECT" \
    --member="serviceAccount:${API_SA}" \
    --role="roles/run.invoker" \
    --quiet >/dev/null
  echo "Granted run.invoker on $VISION_SERVICE -> $API_SA"

  if [[ "${SKIP_VISION_MODEL_PULL:-false}" != "true" ]]; then
    echo "Ensuring vision model is present (warm instance)..."
    "$(dirname "$0")/../vision/pull_model.sh" || echo "WARN: pull_model failed; entrypoint/API will pull on next scan"
  fi
fi

# Cloud Tasks needs API_BASE_URL and OIDC service account on the API revision
gcloud run services update "$API_SERVICE" \
  --region="$REGION" \
  --project="$GCP_PROJECT" \
  --update-env-vars="API_BASE_URL=${API_URL},TASKS_SERVICE_ACCOUNT=${API_SA}" \
  --quiet
echo "Set API_BASE_URL and TASKS_SERVICE_ACCOUNT on $API_SERVICE"

gcloud run services add-iam-policy-binding "$API_SERVICE" \
  --region="$REGION" \
  --project="$GCP_PROJECT" \
  --member="serviceAccount:${API_SA}" \
  --role="roles/run.invoker" \
  --quiet >/dev/null
echo "Granted run.invoker on $API_SERVICE -> $API_SA (Cloud Tasks OIDC -> /process)"

gcloud iam service-accounts add-iam-policy-binding "$API_SA" \
  --project="$GCP_PROJECT" \
  --member="serviceAccount:${API_SA}" \
  --role="roles/iam.serviceAccountUser" \
  --quiet >/dev/null
echo "Granted serviceAccountUser on $API_SA -> $API_SA (Cloud Tasks actAs)"

# Public HTTP access without Google sign-in (org policy may block allUsers IAM)
if [[ "${ALLOW_PUBLIC:-true}" == "true" ]]; then
  gcloud run services update "$API_SERVICE" \
    --region="$REGION" \
    --project="$GCP_PROJECT" \
    --no-invoker-iam-check \
    --quiet
  echo "Public access enabled on $API_SERVICE (--no-invoker-iam-check; no Google account required)"
fi

# Optional: weekly purge cron
if [[ "${SETUP_SCHEDULER:-false}" == "true" ]]; then
  export API_URL
  ADMIN_PURGE_SECRET="$(gcloud secrets versions access latest --secret=ADMIN_PURGE_SECRET --project="$GCP_PROJECT")"
  export ADMIN_PURGE_SECRET
  "$(dirname "$0")/../monitoring/setup_scheduler.sh"
fi

echo ""
echo "=== Post-deploy complete ==="
echo "API_BASE_URL=$API_URL"
echo ""
echo "App auth: SUPABASE_URL + SUPABASE_ANON_KEY are synced from card_scan/mobile/.env (run infra/gcp/sync_supabase_from_mobile_env.sh to refresh)."
echo "Smoke test (production uses SCAN_API_KEY from Secret Manager):"
echo "  export API_BASE_URL=$API_URL"
echo "  export SCAN_API_KEY=\$(gcloud secrets versions access latest --secret=SCAN_API_KEY --project=$GCP_PROJECT)"
echo "  ./scripts/e2e_scan.sh [image.jpg]"
