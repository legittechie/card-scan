# On-demand dependency report

Generate a markdown snapshot of version-related health: toolchain drift, lock freshness, outdated packages, engine warnings, and infra pins.

For lock/upgrade workflows see [DEPENDENCIES.md](DEPENDENCIES.md).

## Prerequisites

Run once (or after pulling dependency changes):

```bash
make install          # backend venv + locked pip deps (for pip lock/outdated checks)
make mobile-install   # mobile/node_modules (for npm / Expo checks)
```

Without `mobile/node_modules`, npm and expo-doctor sections are **skipped**. Without `.venv`, pip sections are **skipped**.

## Run the report

From the repo root:

```bash
make deps-report
```

Example output:

```text
Wrote reports/deps-2026-06-08-185509.md
Summary: 0 error(s), 3 warning(s), 10 check(s)
```

Open the file path printed on the last line. Reports live under `reports/` and are **gitignored** (local only).

## Run without Make

```bash
# uses .venv/bin/python when present, else python3
python3 scripts/deps_report.py
```

### Custom output path

```bash
python3 scripts/deps_report.py -o /tmp/card-scan-deps.md
```

### Print report to terminal as well

```bash
python3 scripts/deps_report.py --stdout
```

## Exit codes

| Code | Meaning |
|------|---------|
| `0` | No **ERROR** findings (warnings are OK) |
| `1` | At least one **ERROR** (e.g. stale pip lock, broken `npm ci --dry-run`) |

Use in scripts:

```bash
make deps-report || echo "Fix errors before committing dependency changes"
```

## What the report includes

| Section | Source | Severity examples |
|---------|--------|-------------------|
| Toolchain | `node`, `npm`, venv Python/pip | **WARN** if Node &lt; 20.19.4 (RN/Metro `EBADENGINE`) |
| npm lock freshness | `npm ci --dry-run` | **ERROR** if lock out of sync |
| npm engine warnings | packages from dry-run stderr | **WARN** for `EBADENGINE` |
| npm outdated | `npm outdated` | **INFO** when upgrades exist |
| pip lock freshness | `pip-compile --dry-run` | **ERROR** if `requirements*.txt` stale |
| pip outdated | direct pins in `requirements*.in` | **INFO** when PyPI has newer |
| Expo doctor | `npx expo-doctor` | **WARN** on project issues |
| Infra & CI pins | Dockerfiles, `deps.yml` | **INFO** for manual review |

## When to run

- Before committing dependency bumps (`make deps-lock` then `make deps-report`)
- Monthly health check (complements Dependabot PRs)
- After Node/Python upgrades on your machine
- When debugging `EBADENGINE` or lock freshness CI failures

## Interpreting common warnings

### Node below `>=20.19.4`

React Native 0.81 / Metro declare a newer Node than you may have installed (e.g. 20.18.3). If Expo and `npm ci` work, this is **informational** — upgrade Node when you choose.

### Many `EBADENGINE` packages

Usually the same root cause as above. Listed package names are transitive Metro/RN packages, not necessarily direct deps to bump.

### expo-doctor issues

Follow expo-doctor’s suggestions (often SDK alignment or missing peer deps). Run `cd mobile && npx expo install --fix` only when you intend to change versions.

## Related commands

| Command | Purpose |
|---------|---------|
| `make deps-check` | Fail fast if locks are stale (CI-style) |
| `make deps-outdated` | Quick terminal list, no markdown file |
| `make deps-lock` | Regenerate locks after editing `package.json` or `requirements*.in` |
| `make test` | Backend tests after pip upgrades |

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `mobile/node_modules` missing | `make mobile-install` |
| `.venv` missing | `make install` |
| `pip-compile` not found | `make install` (installs `pip-tools==7.5.3`) |
| `expo-doctor` hangs or fails | Ensure network; run from `mobile/` with `npx expo-doctor` |
| Report directory missing | Created automatically at `reports/` |
