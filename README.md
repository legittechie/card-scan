# Card Scan

Async business card scanner: **PaddleOCR** + **Llama 3.2 Vision 11B**, FastAPI, SQLite jobs, Google Cloud Tasks.

## Quick start (local)

```bash
cd /Users/dhananjayarya/GDCA/card_scan
cp .env.example .env
cp mobile/.env.example mobile/.env   # set EXPO_PUBLIC_SUPABASE_* (canonical for whole repo)
make install
make dev
```

- `POST /scan` — upload image, returns `job_id` immediately
- `GET /status/{job_id}` — poll for result
- With `SYNC_PROCESS=true`, processing runs inline (no Cloud Tasks)

## Virtual environment

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt
```

## Docker Compose

```bash
docker compose up --build
# Pull vision model (first time, large download):
docker compose exec vision ollama pull llama3.2-vision:11b
```

## Tests

```bash
make test
```

## Production (GCP)

See `infra/gcp/setup.sh`, `infra/vision/deploy.sh`, `infra/api/deploy.sh`.

**Region:** The live stack is in **`us-central1`** (API, vision, Artifact Registry, Cloud Tasks). Do not point `gcloud run deploy` at another region unless you also create a Tasks queue and vision there. Images live in Artifact Registry at `us-central1-docker.pkg.dev/...`; set `AR_REGION=us-central1` when deploying Cloud Run elsewhere:

```bash
export GCP_PROJECT=your-project-id
export REGION=us-central1          # Cloud Run + Tasks (recommended; matches existing services)
export AR_REGION=us-central1         # Where card-scan Docker images are stored
./infra/api/deploy.sh
```

- Cloud Tasks queue: `max-concurrent-dispatches=1` (one GPU job at a time)
- Vision service: Ollama on Cloud Run GPU, `OLLAMA_KEEP_ALIVE=5m`, min 0 / max 1 instances

If `gcloud builds submit` fails with `storage.objects.get` / 403 on `*-compute@developer.gserviceaccount.com`, run:

```bash
export GCP_PROJECT=your-project-id
./infra/gcp/cloudbuild_iam.sh
```

Images are pushed to **Artifact Registry** (`us-central1-docker.pkg.dev/PROJECT/card-scan/card-scan-api`), not legacy `gcr.io`. If you previously set `IMAGE=gcr.io/...`, unset it or use the AR URL above.

**Layered access:**

- **Cloud Run** — public URL (`--no-invoker-iam-check`); no Google IAM token required for clients.
- **`/scan` and `/status`** — app auth when `AUTH_MODE=required` (production default):
  - **Mobile:** `Authorization: Bearer <supabase_access_token>` (same Supabase project as `mobile/.env`).
  - **Scripts / CI:** `X-API-Key: <SCAN_API_KEY>` from Secret Manager.
- **Local dev:** `AUTH_MODE=disabled` in `.env` (no auth headers).
- **`/process` and `/admin/*`** — internal only (`X-Tasks-Secret`, `X-Admin-Secret`).

## Schema

Extracted fields: `Name`, `Company`, `Title`, `Phone`, `Email`, `Website`, `Address`, `BusinessCategory`, `Others` (misc text on card).

## Mobile

Expo app in [mobile/](mobile/README.md): Supabase sign-in, camera upload, skeleton result polling.

```bash
make mobile-install
cp mobile/.env.example mobile/.env   # fill Supabase + API URL
make mobile-dev
```

## Ops

**Purge cron (weekly):**

```bash
export GCP_PROJECT=your-project-id
export API_URL=$(gcloud run services describe card-scan-api --region=us-central1 --format='value(status.url)')
export ADMIN_PURGE_SECRET=$(gcloud secrets versions access latest --secret=ADMIN_PURGE_SECRET)
SETUP_SCHEDULER=true ./infra/gcp/post_deploy.sh
```

**Budget alerts:** run `./infra/monitoring/apply_budget.sh` (needs `BILLING_ACCOUNT`) or create in GCP Console per [infra/monitoring/budgets.yaml](infra/monitoring/budgets.yaml).

**Vision cold start:** if scans fail with model not found, run `./infra/vision/pull_model.sh`.

## Reference

GenAIScript prototype: [scripts/scan-business-card.genai.mjs](scripts/scan-business-card.genai.mjs) — [Microsoft guide](https://microsoft.github.io/genaiscript/guides/business-card-scanner/)

## Post-deploy

After `infra/api/deploy.sh`:

```bash
export GCP_PROJECT=your-project-id
./infra/gcp/post_deploy.sh
export API_BASE_URL=$(gcloud run services describe card-scan-api --region=us-central1 --format='value(status.url)')
./scripts/e2e_scan.sh
```

Production smoke test (uses API key from Secret Manager):

```bash
export SCAN_API_KEY=$(gcloud secrets versions access latest --secret=SCAN_API_KEY --project=$GCP_PROJECT)
./scripts/e2e_scan.sh
```

Local dev needs no auth (`AUTH_MODE=disabled`). For production JWT auth, Cloud Run reads **`SUPABASE_URL` + `SUPABASE_ANON_KEY` from `mobile/.env`** (via `make sync-supabase` or `./infra/api/deploy.sh`). Use `USE_GCP_AUTH=true` only if Cloud Run IAM is enabled instead of public invoker.

## Git

Initial commit is on branch `main`. To push to GitHub:

```bash
git remote add origin git@github.com:YOUR_ORG/card-scan.git
git push -u origin main
```

Or create the repo with GitHub CLI: `gh repo create card-scan --private --source=. --remote=origin --push`
