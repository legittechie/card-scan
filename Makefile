.PHONY: venv install dev test compose-up compose-down e2e mobile-install mobile-dev mobile-dev-prod mobile-dev-tunnel mobile-dev-stop mobile-eas-update mobile-eas-build sync-supabase verify-api-auth deps-lock deps-check deps-outdated deps-report

VENV := .venv
PYTHON := $(VENV)/bin/python
PIP := $(VENV)/bin/pip

venv:
	@test -d $(VENV) || python3 -m venv $(VENV)

install: venv
	$(PIP) install --upgrade pip
	$(PIP) install -r backend/requirements-dev.txt

dev: install
	@set -a && [ -f .env ] && . ./.env; \
	. ./infra/gcp/load_mobile_supabase_env.sh; set +a; \
	SYNC_PROCESS=true SKIP_VISION=true SKIP_PADDLEOCR=true \
	$(VENV)/bin/uvicorn backend.main:app --reload --host 0.0.0.0 --port 8080

test: install
	@set -a && [ -f .env ] && . ./.env; \
	. ./infra/gcp/load_mobile_supabase_env.sh; set +a; \
	SYNC_PROCESS=true SKIP_VISION=true SKIP_PADDLEOCR=true \
	PYTHONPATH=. $(VENV)/bin/pytest backend/tests -q

compose-up:
	docker compose up --build -d

compose-down:
	docker compose down

e2e:
	./scripts/e2e_scan.sh

mobile-install:
	cd mobile && npm ci

# Regenerate lock files after bumping package.json or requirements*.in
deps-lock:
	cd mobile && npm install
	./scripts/compile_python_requirements.sh

# Fail if compiled Python locks are stale (requires pip-tools in venv or PATH)
deps-check:
	cd mobile && npm ci
	@$(PIP) install -q pip-tools==7.5.3
	cd backend && ../$(VENV)/bin/pip-compile --resolver=backtracking --strip-extras --dry-run -o requirements.txt requirements.in >/dev/null
	cd backend && ../$(VENV)/bin/pip-compile --resolver=backtracking --strip-extras --dry-run -o requirements-dev.txt requirements-dev.in >/dev/null
	@echo "Dependency locks are up to date."

deps-outdated:
	@echo "=== mobile (npm outdated) ==="
	cd mobile && npm outdated || true
	@echo ""
	@echo "=== backend (pip outdated) ==="
	@$(PIP) list --outdated 2>/dev/null || true

# Version / lock health report → reports/deps-*.md (see docs/DEPS_REPORT.md)
deps-report:
	@test -x $(PYTHON) && PY=$(PYTHON) || PY=python3; \
	$$PY scripts/deps_report.py

# Publish JS/UI changes OTA (preview channel — matches current EAS Android builds).
mobile-eas-update:
	cd mobile && npm run eas:update

# New native build (preview APK). Use eas:build:production for store releases.
mobile-eas-build:
	cd mobile && npm run eas:build

mobile-dev-stop:
	@echo "Stopping card_scan Metro/Expo listeners on 8081–8090..."
	-@for port in 8081 8082 8083 8090; do \
		pid=$$(lsof -tiTCP:$$port -sTCP:LISTEN 2>/dev/null || true); \
		[ -n "$$pid" ] && kill $$pid 2>/dev/null && echo "  stopped port $$port (pid $$pid)" || true; \
	done

# LAN: phone loads bundle from your Mac IP (same reachable Wi‑Fi required).
# Uses EXPO_PUBLIC_CARD_SCAN_API_TARGET from mobile/.env (default: local API).
mobile-dev: mobile-dev-stop
	cd mobile && npx expo start -c --lan

# Expo Go + production Cloud Run scan API (override target for this session).
mobile-dev-prod: mobile-dev-stop
	cd mobile && EXPO_PUBLIC_CARD_SCAN_API_TARGET=production npx expo start -c --lan

# Tunnel: use when LAN fails with "Failed to download remote update" in Expo Go.
mobile-dev-tunnel: mobile-dev-stop
	cd mobile && npx expo start -c --tunnel

# Push mobile/.env Supabase credentials to Cloud Run (requires GCP_PROJECT + gcloud).
sync-supabase:
	./infra/gcp/sync_supabase_from_mobile_env.sh

verify-api-auth:
	bash mobile/scripts/verify-api-auth.sh
