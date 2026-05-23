#!/usr/bin/env bash
# Cloud Tasks queue — max-concurrent-dispatches=1 serializes GPU work
set -euo pipefail

: "${GCP_PROJECT:?Set GCP_PROJECT}"
LOCATION="${TASKS_LOCATION:-us-central1}"
QUEUE="${TASKS_QUEUE:-card-scan-queue}"

gcloud tasks queues create "$QUEUE" \
  --project="$GCP_PROJECT" \
  --location="$LOCATION" \
  --max-concurrent-dispatches=1 \
  --max-dispatches-per-second=1 \
  2>/dev/null || \
gcloud tasks queues update "$QUEUE" \
  --project="$GCP_PROJECT" \
  --location="$LOCATION" \
  --max-concurrent-dispatches=1 \
  --max-dispatches-per-second=1

echo "Queue $QUEUE ready in $LOCATION (max-concurrent-dispatches=1)"
