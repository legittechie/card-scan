#!/usr/bin/env bash
# Phase 7: Weekly job purge via Cloud Scheduler
set -euo pipefail

: "${GCP_PROJECT:?Set GCP_PROJECT}"
: "${API_URL:?Set API_URL to card-scan-api Cloud Run URL}"
REGION="${REGION:-us-central1}"
JOB_NAME="${PURGE_JOB_NAME:-card-scan-purge-jobs}"

gcloud scheduler jobs create http "$JOB_NAME" \
  --project="$GCP_PROJECT" \
  --location="$REGION" \
  --schedule="0 3 * * 0" \
  --uri="${API_URL%/}/admin/purge-jobs?days=30&failed_days=7" \
  --http-method=POST \
  --headers="X-Admin-Secret=${ADMIN_PURGE_SECRET}" \
  --attempt-deadline=120s \
  2>/dev/null || \
gcloud scheduler jobs update http "$JOB_NAME" \
  --project="$GCP_PROJECT" \
  --location="$REGION" \
  --schedule="0 3 * * 0" \
  --uri="${API_URL%/}/admin/purge-jobs?days=30&failed_days=7" \
  --http-method=POST \
  --headers="X-Admin-Secret=${ADMIN_PURGE_SECRET}"

echo "Scheduler $JOB_NAME configured (weekly Sunday 03:00 UTC)"
