#!/usr/bin/env bash
# Compile backend/requirements*.txt from *.in using pip-tools inside Linux Docker
# (matches python:3.11-slim-bookworm used by backend/Dockerfile).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
IMAGE="${PYTHON_LOCK_IMAGE:-python:3.11-slim-bookworm}"

if ! docker info >/dev/null 2>&1; then
  echo "Docker unavailable — compiling with local pip-tools (use Docker for Linux-accurate Paddle wheels)."
  PIP_COMPILE="${ROOT}/.venv/bin/pip-compile"
  if [ ! -x "${PIP_COMPILE}" ]; then
    python3 -m pip install --quiet "pip-tools==7.5.3"
    PIP_COMPILE="pip-compile"
  fi
  cd "${ROOT}/backend"
  "${PIP_COMPILE}" --resolver=backtracking --strip-extras -o requirements.txt requirements.in
  "${PIP_COMPILE}" --resolver=backtracking --strip-extras -o requirements-dev.txt requirements-dev.in
  echo "Wrote backend/requirements.txt and backend/requirements-dev.txt"
  exit 0
fi

echo "Compiling Python requirements in ${IMAGE}..."

docker run --rm \
  -v "${ROOT}:/work" \
  -w /work/backend \
  "${IMAGE}" \
  bash -c '
    set -euo pipefail
    apt-get update -qq
    apt-get install -y -qq --no-install-recommends \
      libgomp1 libglib2.0-0 libsm6 libxext6 libxrender1 libgl1 \
      >/dev/null
    pip install --quiet "pip-tools==7.5.3"
    pip-compile --resolver=backtracking --strip-extras -o requirements.txt requirements.in
    pip-compile --resolver=backtracking --strip-extras -o requirements-dev.txt requirements-dev.in
  '

echo "Wrote backend/requirements.txt and backend/requirements-dev.txt"
