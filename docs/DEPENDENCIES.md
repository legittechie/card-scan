# Dependency management

Card Scan uses **locked dependencies** for reproducible installs. Human-edited source files define what to bump; lock files pin the full resolved tree.

## Source vs lock files

| Layer | Edit this | Generated / committed lock |
|-------|-----------|----------------------------|
| Mobile direct deps | [`mobile/package.json`](../mobile/package.json) | [`mobile/package-lock.json`](../mobile/package-lock.json) |
| Backend prod deps | [`backend/requirements.in`](../backend/requirements.in) | [`backend/requirements.txt`](../backend/requirements.txt) |
| Backend dev deps | [`backend/requirements-dev.in`](../backend/requirements-dev.in) | [`backend/requirements-dev.txt`](../backend/requirements-dev.txt) |

**Never hand-edit** `requirements.txt`, `requirements-dev.txt`, or `package-lock.json`.

## Install (fresh clone)

```bash
# Backend (dev + tests)
make install

# Mobile
make mobile-install   # runs npm ci
```

Production Docker (`backend/Dockerfile`) installs **`requirements.txt` only** (no pytest).

## Regenerate locks

After changing `package.json` or `requirements*.in`:

```bash
make deps-lock
```

Python locks compile inside **Linux Docker** (`python:3.11-slim-bookworm`) when Docker is running — matches Cloud Run. Without Docker, the script falls back to local `pip-tools` (macOS wheels may differ for Paddle).

Verify locks are current:

```bash
make deps-check
```

See what could be upgraded:

```bash
make deps-outdated
```

## Upgrading mobile

### Patch / minor (single package)

1. Bump exact version in `mobile/package.json`
2. `cd mobile && npm install`
3. `npm run lint`
4. Commit `package.json` + `package-lock.json`
5. Ship: `make mobile-eas-update` (JS) or `make mobile-eas-build` (native)

### Expo SDK

```bash
cd mobile
npx expo install expo@<sdk-version>
npx expo install --fix
npm run lint
make deps-lock   # refresh lock if package.json changed
```

Native module changes require a **new EAS build**, not OTA alone.

## Upgrading backend

### Single package

1. Bump `==` version in `backend/requirements.in`
2. `make deps-lock`
3. `make test`
4. Redeploy: `./infra/api/deploy.sh`

### Paddle / OCR

Bump `paddlepaddle` and `paddleocr` together in `requirements.in`. Test OCR on a sample card. Prefer `make deps-lock` with Docker for Linux-accurate resolution.

## Visibility

- **Dependabot** — weekly PRs for npm (`mobile/`) and pip (`backend/requirements.in`). After merging, run `make deps-lock` if the PR only changed source pins.
- **CI** — [`.github/workflows/deps.yml`](../.github/workflows/deps.yml) runs `npm ci`, backend tests, and lock freshness on every PR.
- **On-demand report** — [DEPS_REPORT.md](DEPS_REPORT.md): `make deps-report` → `reports/deps-YYYY-MM-DD-HHMMSS.md` (gitignored).
- **Manual** — `make deps-outdated` for a quick terminal listing.

## Intentional major upgrades

Record notable upgrades here:

| Date | Component | From → To | Notes |
|------|-----------|-----------|-------|
| 2026-03 | All | — | Initial lock: Expo 54, RN 0.81, FastAPI 0.136, pip-tools |

## Out of scope

- **Ollama image** — pinned in [`infra/vision/Dockerfile`](../infra/vision/Dockerfile) (`0.24.0`)
- **Supabase Postgres** — hosted project version
- **EAS native fingerprints** — separate from npm lock; new build when native deps change
