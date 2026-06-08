# Deployment

How production is shipped today, and what is **planned but deferred** for GitHub-driven deploys.

## Current state (manual)

Pushing to GitHub **does not** deploy the API or publish mobile updates. GitHub only runs CI ([`.github/workflows/deps.yml`](../.github/workflows/deps.yml): lint, tests, lock checks) and Dependabot PRs.

| Target | How to deploy today | Script / command |
|--------|---------------------|------------------|
| **API (Cloud Run)** | Manual from a machine with `gcloud` | `./infra/api/deploy.sh` |
| **Vision (GPU)** | Manual | `./infra/vision/deploy.sh` |
| **Mobile JS (OTA)** | Manual via EAS | `make mobile-eas-update` → `preview` channel |
| **Mobile native (APK/AAB)** | Manual via EAS | `make mobile-eas-build` |

Production API URL (configured in `mobile/eas.json` and `app.config.ts`):

`https://card-scan-api-827778437977.us-central1.run.app`

EAS project and OTA endpoint are in `mobile/app.config.ts` (`extra.eas.projectId`, `updates.url`).

### Typical release flow (today)

**Backend change**

```bash
export GCP_PROJECT=your-project-id
export REGION=us-central1
export AR_REGION=us-central1
make test
./infra/api/deploy.sh
```

**Mobile UI / JS only** (no native dependency change)

```bash
cd mobile && npm run lint
make mobile-eas-update          # preview channel
# or: cd mobile && npm run eas:update:production
```

**Mobile native change** (Expo SDK, `react-native`, new native modules)

```bash
make mobile-eas-build           # preview APK
# then OTA if needed
make mobile-eas-update
```

See [README.md](../README.md) (Production) and [mobile/README.md](../mobile/README.md) for environment and auth setup.

---

## Deferred: GitHub → GCP + EAS automation

**Status: not implemented.** We intentionally keep deploys manual until the app is stable and pre-commit QA is routine.

### Goal

On merge to `main` (with path filters), automatically:

1. **Cloud Run API** — build image via Cloud Build, deploy `card-scan-api`
2. **EAS OTA** — publish JS bundle to `preview` (and optionally `production` on tags)
3. **EAS native build** — remain **manual** or rare (native dep bumps only)

### Why deferred

- Deploy scripts today require **`mobile/.env`** (gitignored); CI needs GitHub Secrets or a script fallback
- API deploy is heavy (Paddle Docker image); should not run on unrelated pushes
- OTA and API should be validated on device before tying to every `main` push
- GCP Workload Identity Federation + `EXPO_TOKEN` setup is one-time ops work

### Planned approach (when we pick this up)

1. **Secrets** — `GCP_PROJECT`, WIF or deploy SA, `EXPO_TOKEN`, `EXPO_PUBLIC_SUPABASE_*` in GitHub Secrets (not in repo)
2. **Script tweak** — `infra/gcp/load_mobile_supabase_env.sh` falls back to env vars when `mobile/.env` is absent (CI)
3. **Workflows** (new under `.github/workflows/`):
   - `deploy-api.yml` — paths `backend/**`, `infra/api/**`; start with `workflow_dispatch`, then auto on `main`
   - `deploy-mobile-ota.yml` — paths `mobile/**`; `eas update --channel preview`
   - `deploy-mobile-build.yml` — manual `workflow_dispatch` only
4. **Safeguards** — GitHub `production` environment with reviewers, concurrency groups, post-deploy `e2e_scan.sh` smoke test
5. **Docs** — update this file with the live workflow names and triggers

### What already exists on GitHub

| Integration | Purpose |
|-------------|---------|
| `deps.yml` | Lint, backend tests, lock freshness on PR/push |
| `dependabot.yml` | Weekly dependency PRs (npm + pip) |

No `deploy-*.yml` workflows yet.

---

## Related docs

- [DEPENDENCIES.md](DEPENDENCIES.md) — locked installs, `make deps-lock`, Dependabot
- [DEPS_REPORT.md](DEPS_REPORT.md) — on-demand version health report
