#!/bin/sh
# Start Ollama immediately, pull the vision model in the background on each new GPU instance.
set -e

MODEL="${OLLAMA_MODEL:-llama3.2-vision:11b}"

/bin/ollama serve &
SERVE_PID=$!

echo "vision-entrypoint: waiting for Ollama API..."
until /usr/bin/curl -sf http://127.0.0.1:11434/api/tags >/dev/null 2>&1; do
  sleep 1
done
echo "vision-entrypoint: Ollama ready; pulling ${MODEL} in background"

/bin/ollama pull "${MODEL}" &
PULL_PID=$!

trap 'kill "$SERVE_PID" "$PULL_PID" 2>/dev/null || true' TERM INT

wait "$SERVE_PID"
exit $?
