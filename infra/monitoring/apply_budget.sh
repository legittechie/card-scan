#!/usr/bin/env bash
# Apply monthly billing budget from budgets.yaml (requires Billing Account Admin).
# If CLI fails, use Console: Billing → Budgets & alerts → Create budget.
set -euo pipefail

: "${GCP_PROJECT:?Set GCP_PROJECT}"
BILLING_ACCOUNT="${BILLING_ACCOUNT:-}"
AMOUNT_USD="${BUDGET_AMOUNT_USD:-100}"

if [[ -z "$BILLING_ACCOUNT" ]]; then
  echo "Set BILLING_ACCOUNT to your billing account ID (gcloud billing accounts list)."
  echo ""
  echo "Console alternative (recommended):"
  echo "  1. Billing → Budgets & alerts → Create budget"
  echo "  2. Scope: project $GCP_PROJECT"
  echo "  3. Amount: \$$AMOUNT_USD/month"
  echo "  4. Thresholds: 50%, 90%, 100% forecast"
  echo "  5. Email billing admins"
  exit 0
fi

gcloud billing budgets create \
  --billing-account="$BILLING_ACCOUNT" \
  --display-name="card-scan-monthly-budget" \
  --budget-amount="${AMOUNT_USD}USD" \
  --filter-projects="projects/${GCP_PROJECT}" \
  --threshold-rule=percent=0.5,basis=current-spend \
  --threshold-rule=percent=0.9,basis=current-spend \
  --threshold-rule=percent=1.0,basis=forecasted-spend

echo "Budget created for project $GCP_PROJECT (\$$AMOUNT_USD/month)"
