.PHONY: venv install dev test compose-up compose-down e2e mobile-install mobile-dev mobile-dev-prod mobile-dev-tunnel mobile-dev-stop sync-supabase verify-api-auth

VENV := .venv
PYTHON := $(VENV)/bin/python
PIP := $(VENV)/bin/pip

venv:
	@test -d $(VENV) || python3 -m venv $(VENV)

install: venv
	$(PIP) install --upgrade pip
	$(PIP) install -r backend/requirements.txt

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
	cd mobile && npm install

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
