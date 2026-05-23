#!/usr/bin/env bash
# Phase 1: GCP foundation — bucket, service accounts, secrets (manual follow-up for secret values)
set -euo pipefail

: "${GCP_PROJECT:?Set GCP_PROJECT}"
REGION="${REGION:-us-central1}"
BUCKET="${GCS_BUCKET:-card-scan-uploads}"

echo "Project: $GCP_PROJECT  Region: $REGION  Bucket: $BUCKET"

gcloud config set project "$GCP_PROJECT"

# GCS bucket
if ! gcloud storage buckets describe "gs://${BUCKET}" &>/dev/null; then
  gcloud storage buckets create "gs://${BUCKET}" \
    --project="$GCP_PROJECT" \
    --location="$REGION" \
    --uniform-bucket-level-access
fi

# Service accounts
for SA in card-scan-api card-scan-vision; do
  EMAIL="${SA}@${GCP_PROJECT}.iam.gserviceaccount.com"
  if ! gcloud iam service-accounts describe "$EMAIL" &>/dev/null; then
    gcloud iam service-accounts create "$SA" \
      --display-name="$SA"
  fi
done

API_SA="card-scan-api@${GCP_PROJECT}.iam.gserviceaccount.com"
gcloud storage buckets add-iam-policy-binding "gs://${BUCKET}" \
  --member="serviceAccount:${API_SA}" \
  --role="roles/storage.objectAdmin" \
  --quiet

gcloud projects add-iam-policy-binding "$GCP_PROJECT" \
  --member="serviceAccount:${API_SA}" \
  --role="roles/cloudtasks.enqueuer" \
  --quiet

# API must actAs itself when enqueueing Cloud Tasks with OIDC
gcloud iam service-accounts add-iam-policy-binding "$API_SA" \
  --project="$GCP_PROJECT" \
  --member="serviceAccount:${API_SA}" \
  --role="roles/iam.serviceAccountUser" \
  --quiet >/dev/null

# Cloud Build + staging bucket IAM (required before gcloud builds submit)
"$(dirname "$0")/cloudbuild_iam.sh"

# Secrets + accessor IAM for card-scan-api Cloud Run revision
"$(dirname "$0")/secrets.sh"

echo ""
echo "Then run: infra/tasks/create_queue.sh"
