#!/usr/bin/env bash
# Ollama + Llama 3.2 Vision 11B on Cloud Run GPU (auto-pull model on instance start).
set -euo pipefail

: "${GCP_PROJECT:?Set GCP_PROJECT}"
REGION="${REGION:-us-central1}"
AR_REGION="${AR_REGION:-us-central1}"
SERVICE="${VISION_SERVICE:-card-scan-vision}"
SA="${VISION_SA:-card-scan-vision@${GCP_PROJECT}.iam.gserviceaccount.com}"
AR_REPO="${AR_REPO:-card-scan}"
IMAGE="${VISION_IMAGE:-${AR_REGION}-docker.pkg.dev/${GCP_PROJECT}/${AR_REPO}/card-scan-vision:latest}"
MODEL="${OLLAMA_MODEL:-llama3.2-vision:11b}"

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

"$(dirname "$0")/../gcp/cloudbuild_iam.sh"

export AR_REGION
gcloud builds submit \
  --project="$GCP_PROJECT" \
  --config=infra/vision/cloudbuild.yaml \
  --substitutions="_IMAGE=$IMAGE" \
  .

gcloud run deploy "$SERVICE" \
  --project="$GCP_PROJECT" \
  --region="$REGION" \
  --image="$IMAGE" \
  --service-account="$SA" \
  --port=11434 \
  --cpu=4 \
  --memory=16Gi \
  --gpu=1 \
  --gpu-type=nvidia-l4 \
  --no-gpu-zonal-redundancy \
  --min-instances=0 \
  --max-instances=1 \
  --ingress=all \
  --set-env-vars="OLLAMA_MODEL=${MODEL},OLLAMA_KEEP_ALIVE=24h" \
  --timeout=900 \
  --no-allow-unauthenticated

echo ""
echo "Vision service deploys with entrypoint that pulls ${MODEL} on each new GPU instance."
echo "Store internal URL in Secret Manager as VISION_INTERNAL_URL (post_deploy does this)."
