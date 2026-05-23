#!/usr/bin/env bash
# Grant IAM so `gcloud builds submit` can stage source and push images.
# Fixes: 403 storage.objects.get on *-compute@developer.gserviceaccount.com
set -euo pipefail

: "${GCP_PROJECT:?Set GCP_PROJECT}"
AR_REGION="${AR_REGION:-us-central1}"
AR_REPO="${AR_REPO:-card-scan}"

gcloud config set project "$GCP_PROJECT"

PROJECT_NUMBER="$(gcloud projects describe "$GCP_PROJECT" --format='value(projectNumber)')"
CLOUDBUILD_SA="${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com"
COMPUTE_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"
CLOUDBUILD_BUCKET="${GCP_PROJECT}_cloudbuild"

echo "Project number: $PROJECT_NUMBER"
echo "Cloud Build SA:   $CLOUDBUILD_SA"
echo "Compute SA:       $COMPUTE_SA"

# Required APIs
gcloud services enable \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  run.googleapis.com \
  containerregistry.googleapis.com \
  --project="$GCP_PROJECT"

# Cloud Build service account (standard path)
for ROLE in \
  roles/cloudbuild.builds.builder \
  roles/storage.admin \
  roles/artifactregistry.writer \
  roles/artifactregistry.createOnPushWriter \
  roles/logging.logWriter; do
  gcloud projects add-iam-policy-binding "$GCP_PROJECT" \
    --member="serviceAccount:${CLOUDBUILD_SA}" \
    --role="$ROLE" \
    --quiet >/dev/null
  echo "Granted $ROLE -> $CLOUDBUILD_SA"
done

# When org policy routes builds through the default Compute Engine SA
for ROLE in \
  roles/storage.objectAdmin \
  roles/artifactregistry.writer \
  roles/artifactregistry.createOnPushWriter \
  roles/logging.logWriter; do
  gcloud projects add-iam-policy-binding "$GCP_PROJECT" \
    --member="serviceAccount:${COMPUTE_SA}" \
    --role="$ROLE" \
    --quiet >/dev/null
  echo "Granted $ROLE -> $COMPUTE_SA"
done

# Ensure default Cloud Build staging bucket exists and grant bucket-level access
if ! gcloud storage buckets describe "gs://${CLOUDBUILD_BUCKET}" &>/dev/null; then
  gcloud storage buckets create "gs://${CLOUDBUILD_BUCKET}" \
    --project="$GCP_PROJECT" \
    --location="${AR_REGION}" \
    --uniform-bucket-level-access
  echo "Created gs://${CLOUDBUILD_BUCKET}"
fi

for SA in "$CLOUDBUILD_SA" "$COMPUTE_SA"; do
  gcloud storage buckets add-iam-policy-binding "gs://${CLOUDBUILD_BUCKET}" \
    --member="serviceAccount:${SA}" \
    --role="roles/storage.objectAdmin" \
    --quiet >/dev/null
  echo "Granted storage.objectAdmin on ${CLOUDBUILD_BUCKET} -> ${SA}"
done

# Artifact Registry (preferred over legacy gcr.io — repo must exist before push)
if ! gcloud artifacts repositories describe "$AR_REPO" \
  --location="$AR_REGION" --project="$GCP_PROJECT" &>/dev/null; then
  gcloud artifacts repositories create "$AR_REPO" \
    --project="$GCP_PROJECT" \
    --location="$AR_REGION" \
    --repository-format=docker \
    --description="Card scan API and worker images"
  echo "Created Artifact Registry repo: ${AR_REGION}-docker.pkg.dev/${GCP_PROJECT}/${AR_REPO}"
fi

for SA in "$CLOUDBUILD_SA" "$COMPUTE_SA"; do
  gcloud artifacts repositories add-iam-policy-binding "$AR_REPO" \
    --location="$AR_REGION" \
    --project="$GCP_PROJECT" \
    --member="serviceAccount:${SA}" \
    --role="roles/artifactregistry.writer" \
    --quiet >/dev/null
  echo "Granted artifactregistry.writer on ${AR_REPO} -> ${SA}"
done

echo ""
echo "Cloud Build IAM ready. Use IMAGE=${AR_REGION}-docker.pkg.dev/${GCP_PROJECT}/${AR_REPO}/card-scan-api:latest"
echo "Re-run: ./infra/api/deploy.sh"
