#!/usr/bin/env bash
# Create Secret Manager secrets and grant card-scan-api access.
set -euo pipefail

: "${GCP_PROJECT:?Set GCP_PROJECT}"

gcloud config set project "$GCP_PROJECT"
gcloud services enable secretmanager.googleapis.com --project="$GCP_PROJECT"

API_SA="card-scan-api@${GCP_PROJECT}.iam.gserviceaccount.com"

_ensure_secret() {
  local name="$1"
  local placeholder="$2"

  if ! gcloud secrets describe "$name" --project="$GCP_PROJECT" &>/dev/null; then
    echo -n "$placeholder" | gcloud secrets create "$name" \
      --project="$GCP_PROJECT" \
      --replication-policy=automatic \
      --data-file=-
    echo "Created secret: $name (update value before production use)"
  else
    echo "Secret exists: $name"
    if ! gcloud secrets versions list "$name" --project="$GCP_PROJECT" --limit=1 --format='value(name)' 2>/dev/null | grep -q .; then
      echo -n "$placeholder" | gcloud secrets versions add "$name" \
        --project="$GCP_PROJECT" \
        --data-file=-
      echo "Added initial version to $name"
    fi
  fi

  gcloud secrets add-iam-policy-binding "$name" \
    --project="$GCP_PROJECT" \
    --member="serviceAccount:${API_SA}" \
    --role="roles/secretmanager.secretAccessor" \
    --quiet >/dev/null
  echo "Granted secretAccessor on $name -> $API_SA"
}

# Placeholders — replace after vision deploy / before going live
_ensure_secret "VISION_INTERNAL_URL" "http://localhost:11434"
_ensure_secret "TASKS_PROCESSOR_SECRET" "$(openssl rand -hex 32)"
_ensure_secret "ADMIN_PURGE_SECRET" "$(openssl rand -hex 32)"
_ensure_secret "SCAN_API_KEY" "$(openssl rand -hex 32)"
_ensure_secret "SUPABASE_ANON_KEY" "replace-with-platform-supabase-anon-key"

echo ""
echo "Update VISION_INTERNAL_URL after deploying card-scan-vision:"
echo "  echo -n 'https://...' | gcloud secrets versions add VISION_INTERNAL_URL --data-file=-"
echo ""
echo "Set Platform Supabase credentials (same project as mobile/Platform app):"
echo "  echo -n 'https://YOUR.supabase.co' | gcloud run services update card-scan-api --update-env-vars=SUPABASE_URL=..."
echo "  printf '%s' 'eyJ...' | gcloud secrets versions add SUPABASE_ANON_KEY --data-file=-"
echo "  (no trailing newline — or pipe through: tr -d '\\n')"
echo ""
echo "E2E with API key:"
echo "  export SCAN_API_KEY=\$(gcloud secrets versions access latest --secret=SCAN_API_KEY)"
