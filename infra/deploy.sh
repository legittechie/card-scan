#!/usr/bin/env bash
# Full production deploy orchestration
set -euo pipefail

: "${GCP_PROJECT:?Set GCP_PROJECT}"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

"$SCRIPT_DIR/gcp/setup.sh"
"$SCRIPT_DIR/tasks/create_queue.sh"
"$SCRIPT_DIR/vision/deploy.sh"
"$SCRIPT_DIR/api/deploy.sh"
"$SCRIPT_DIR/gcp/post_deploy.sh"

echo "Deploy complete. Run: export API_BASE_URL=\$(gcloud run services describe card-scan-api --region=us-central1 --format='value(status.url)') && ./scripts/e2e_scan.sh"
