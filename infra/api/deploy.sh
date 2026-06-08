#!/usr/bin/env bash
# Phase 6: Deploy FastAPI (CPU) to Cloud Run
set -euo pipefail

: "${GCP_PROJECT:?Set GCP_PROJECT}"
# Cloud Run region (where the service runs)
REGION="${REGION:-us-central1}"
# Artifact Registry region (where images are built/stored; decoupled from Cloud Run)
AR_REGION="${AR_REGION:-us-central1}"
SERVICE="${API_SERVICE:-card-scan-api}"
SA="${API_SA:-card-scan-api@${GCP_PROJECT}.iam.gserviceaccount.com}"
AR_REPO="${AR_REPO:-card-scan}"
IMAGE="${IMAGE:-${AR_REGION}-docker.pkg.dev/${GCP_PROJECT}/${AR_REPO}/card-scan-api:latest}"

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

# Supabase credentials always come from card_scan/mobile/.env (not Platform or card_scan/.env).
# shellcheck source=../gcp/load_mobile_supabase_env.sh
source "$(dirname "$0")/../gcp/load_mobile_supabase_env.sh"
echo "Using Supabase from $MOBILE_ENV_FILE → ${SUPABASE_URL}"

if [[ "$REGION" != "$AR_REGION" ]]; then
  echo "NOTE: Cloud Run region=$REGION, Artifact Registry=$AR_REGION (image pulled cross-region)."
  echo "      Cloud Tasks queue must exist in TASKS_LOCATION=$REGION (run infra/tasks/create_queue.sh)."
fi

_run_deploy() {
  local auth_flag="$1"
  gcloud run deploy "$SERVICE" \
    --project="$GCP_PROJECT" \
    --region="$REGION" \
    --image="$IMAGE" \
    --service-account="$SA" \
    --port=8080 \
    --cpu=2 \
    --memory=4Gi \
    --min-instances=0 \
    --max-instances=3 \
    --ingress=all \
    --no-invoker-iam-check \
    --timeout=900 \
    --set-env-vars="USE_GCS=true,GCS_BUCKET=${GCS_BUCKET:-card-scan-uploads},GCP_PROJECT=${GCP_PROJECT},TASKS_LOCATION=${REGION},TASKS_QUEUE=card-scan-queue,SYNC_PROCESS=false,SKIP_PADDLEOCR=false,SKIP_VISION=false,AUTH_MODE=${AUTH_MODE:-required},SUPABASE_URL=${SUPABASE_URL:-}" \
    --set-secrets="VISION_URL=VISION_INTERNAL_URL:latest,TASKS_PROCESSOR_SECRET=TASKS_PROCESSOR_SECRET:latest,ADMIN_PURGE_SECRET=ADMIN_PURGE_SECRET:latest,SUPABASE_ANON_KEY=SUPABASE_ANON_KEY:latest,SUPABASE_SERVICE_ROLE_KEY=SUPABASE_SERVICE_ROLE_KEY:latest,SCAN_API_KEY=SCAN_API_KEY:latest" \
    "$auth_flag"
}

# Ensure Cloud Build + Secret Manager IAM before deploy
"$(dirname "$0")/../gcp/cloudbuild_iam.sh"
"$(dirname "$0")/../gcp/secrets.sh"

export AR_REGION
gcloud builds submit \
  --project="$GCP_PROJECT" \
  --config=infra/api/cloudbuild.yaml \
  --substitutions=_IMAGE="$IMAGE" \
  .

if ! gcloud artifacts docker images describe "$IMAGE" --project="$GCP_PROJECT" &>/dev/null; then
  echo "ERROR: Container image not found: $IMAGE"
  echo "  Cloud Run REGION=$REGION must not be used as the Artifact Registry hostname."
  echo "  Set AR_REGION=us-central1 (where card-scan repo exists) or build with:"
  echo "    export AR_REGION=$REGION && ./infra/api/deploy.sh"
  exit 1
fi

# Public HTTP access (no Google account required). Uses --no-invoker-iam-check when
# org policy blocks allUsers IAM binding.
if [[ "${ALLOW_PUBLIC:-true}" == "true" ]]; then
  _run_deploy --allow-unauthenticated
else
  _run_deploy --no-allow-unauthenticated
fi

# --set-env-vars above replaces all env vars; restore task dispatch URL immediately
# so Cloud Tasks never enqueue http://localhost:8080/process (default api_base_url).
API_URL="$(gcloud run services describe "$SERVICE" \
  --region="$REGION" --project="$GCP_PROJECT" \
  --format='value(status.url)')"
gcloud run services update "$SERVICE" \
  --project="$GCP_PROJECT" \
  --region="$REGION" \
  --update-env-vars="API_BASE_URL=${API_URL},TASKS_SERVICE_ACCOUNT=${SA}" \
  --quiet
echo "Set API_BASE_URL=${API_URL} and TASKS_SERVICE_ACCOUNT=${SA}"

# Push mobile/.env Supabase credentials to Secret Manager + Cloud Run revision.
"$(dirname "$0")/../gcp/sync_supabase_from_mobile_env.sh"

"$(dirname "$0")/../gcp/post_deploy.sh"
