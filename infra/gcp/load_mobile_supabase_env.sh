#!/usr/bin/env bash
# Canonical Supabase credentials for card_scan (backend, deploy, Cloud Run).
# Always read from card_scan/mobile/.env — never Platform/.env or card_scan/.env.
#
# Usage (must source, not execute):
#   source infra/gcp/load_mobile_supabase_env.sh
#
# Exports: SUPABASE_URL, SUPABASE_ANON_KEY, MOBILE_ENV_FILE

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  echo "Source this script: source infra/gcp/load_mobile_supabase_env.sh" >&2
  exit 1
fi

_LOADER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
_ROOT="$(cd "${_LOADER_DIR}/../.." && pwd)"
MOBILE_ENV_FILE="${MOBILE_ENV:-${_ROOT}/mobile/.env}"

if [[ ! -f "$MOBILE_ENV_FILE" ]]; then
  echo "Missing $MOBILE_ENV_FILE — copy mobile/.env.example and set EXPO_PUBLIC_SUPABASE_*" >&2
  return 1 2>/dev/null || exit 1
fi

# shellcheck disable=SC1090
set -a
source "$MOBILE_ENV_FILE"
set +a

if [[ -z "${EXPO_PUBLIC_SUPABASE_URL:-}" || -z "${EXPO_PUBLIC_SUPABASE_ANON_KEY:-}" ]]; then
  echo "EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY required in $MOBILE_ENV_FILE" >&2
  return 1 2>/dev/null || exit 1
fi

export SUPABASE_URL="${EXPO_PUBLIC_SUPABASE_URL%/}"
export SUPABASE_ANON_KEY="$(printf '%s' "$EXPO_PUBLIC_SUPABASE_ANON_KEY" | tr -d '\n')"
