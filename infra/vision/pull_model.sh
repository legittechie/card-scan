#!/usr/bin/env bash
# Pull llama3.2-vision:11b on card-scan-vision (run once after first deploy).
set -euo pipefail

: "${GCP_PROJECT:?Set GCP_PROJECT}"
REGION="${REGION:-us-central1}"
SERVICE="${VISION_SERVICE:-card-scan-vision}"
MODEL="${OLLAMA_MODEL:-llama3.2-vision:11b}"

VISION_URL="$(gcloud run services describe "$SERVICE" \
  --region="$REGION" --project="$GCP_PROJECT" \
  --format='value(status.url)')"

echo "Vision URL: $VISION_URL"
echo "Pulling model $MODEL via Cloud Run Jobs pattern..."

# Use gcloud run jobs or exec — simplest: temporary curl to Ollama API with auth
# User accounts cannot use --audiences; service accounts can. Try both.
if TOKEN="$(gcloud auth print-identity-token --audiences="$VISION_URL" 2>/dev/null)"; then
  :
else
  TOKEN="$(gcloud auth print-identity-token)"
fi

curl -sf -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d "{\"name\":\"$MODEL\"}" \
  "$VISION_URL/api/pull" || {
  echo ""
  echo "If /api/pull fails, open Cloud Console -> Cloud Run -> $SERVICE -> Exec"
  echo "and run: ollama pull $MODEL"
  exit 1
}

echo "Model pull requested. Verify with:"
echo "  curl -H \"Authorization: Bearer \$(gcloud auth print-identity-token)\" $VISION_URL/api/tags"
