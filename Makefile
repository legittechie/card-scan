.PHONY: venv install dev test compose-up compose-down e2e mobile-install mobile-dev

VENV := .venv
PYTHON := $(VENV)/bin/python
PIP := $(VENV)/bin/pip

venv:
	@test -d $(VENV) || python3 -m venv $(VENV)

install: venv
	$(PIP) install --upgrade pip
	$(PIP) install -r backend/requirements.txt

dev: install
	@set -a && [ -f .env ] && . ./.env; set +a; \
	SYNC_PROCESS=true SKIP_VISION=true SKIP_PADDLEOCR=true \
	$(VENV)/bin/uvicorn backend.main:app --reload --host 0.0.0.0 --port 8080

test: install
	@set -a && [ -f .env ] && . ./.env; set +a; \
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

mobile-dev:
	cd mobile && npx expo start
