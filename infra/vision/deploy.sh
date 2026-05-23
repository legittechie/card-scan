#!/usr/bin/env bash
# Phase 3: Ollama + Llama 3.2 Vision 11B on Cloud Run GPU
set -euo pipefail

: "${GCP_PROJECT:?Set GCP_PROJECT}"
REGION="${REGION:-us-central1}"
SERVICE="${VISION_SERVICE:-card-scan-vision}"
SA="${VISION_SA:-card-scan-vision@${GCP_PROJECT}.iam.gserviceaccount.com}"

gcloud run deploy "$SERVICE" \
  --project="$GCP_PROJECT" \
  --region="$REGION" \
  --image=ollama/ollama:latest \
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
  --set-env-vars="OLLAMA_KEEP_ALIVE=5m" \
  --timeout=900 \
  --no-allow-unauthenticated

echo ""
echo "After deploy, exec into the service or use a startup job to run:"
echo "  ollama pull llama3.2-vision:11b"
echo ""
echo "Store internal URL in Secret Manager as VISION_INTERNAL_URL"
