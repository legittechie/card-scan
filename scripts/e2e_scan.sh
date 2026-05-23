#!/usr/bin/env bash
set -euo pipefail

API="${API_BASE_URL:-http://localhost:8080}"
SAMPLE="${1:-samples/test-card.png}"
EXTRA_HEADERS=()

# App auth: SCAN_API_KEY for production (AUTH_MODE=required), or Supabase JWT.
if [[ -n "${SCAN_API_KEY:-}" ]]; then
  EXTRA_HEADERS=(-H "X-API-Key: ${SCAN_API_KEY}")
elif [[ -n "${SUPABASE_ACCESS_TOKEN:-}" ]]; then
  EXTRA_HEADERS=(-H "Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}")
# Legacy: Cloud Run IAM when public access is disabled.
elif [[ "${USE_GCP_AUTH:-false}" == "true" ]]; then
  if [[ -n "${GCP_IDENTITY_TOKEN:-}" ]]; then
    EXTRA_HEADERS=(-H "Authorization: Bearer ${GCP_IDENTITY_TOKEN}")
  elif TOKEN=$(gcloud auth print-identity-token 2>/dev/null); then
    EXTRA_HEADERS=(-H "Authorization: Bearer ${TOKEN}")
  fi
fi

if [[ ! -f "$SAMPLE" ]]; then
  echo "Creating minimal test PNG at $SAMPLE"
  mkdir -p samples
  python3 -c "
import struct, zlib
def png(w,h):
    def chunk(t,d): return struct.pack('>I',len(d))+t+d+struct.pack('>I',zlib.crc32(t+d)&0xffffffff)
    sig=b'\\x89PNG\\r\\n\\x1a\\n'
    ihdr=chunk(b'IHDR',struct.pack('>IIBBBBB',w,h,8,2,0,0,0))
    raw=b''.join(b'\\x00'+bytes([128,64,192]*w) for _ in range(h))
    idat=chunk(b'IDAT',zlib.compress(raw))
    iend=chunk(b'IEND',b'')
    return sig+ihdr+idat+iend
open('$SAMPLE','wb').write(png(64,40))
"
fi

echo "POST $API/scan"
if [[ ${#EXTRA_HEADERS[@]} -gt 0 ]]; then
  SCAN_RESP=$(curl -sf "${EXTRA_HEADERS[@]}" -F "file=@${SAMPLE}" "$API/scan")
else
  SCAN_RESP=$(curl -sf -F "file=@${SAMPLE}" "$API/scan")
fi
JOB=$(echo "$SCAN_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin)['job_id'])")
echo "job_id=$JOB"

for i in $(seq 1 60); do
  if [[ ${#EXTRA_HEADERS[@]} -gt 0 ]]; then
    BODY=$(curl -sf "${EXTRA_HEADERS[@]}" "$API/status/$JOB")
  else
    BODY=$(curl -sf "$API/status/$JOB")
  fi
  STATUS=$(echo "$BODY" | python3 -c "import sys,json; print(json.load(sys.stdin)['status'])")
  echo "poll $i: $STATUS"
  if [[ "$STATUS" == "completed" || "$STATUS" == "failed" ]]; then
    echo "$BODY" | python3 -m json.tool
    [[ "$STATUS" == "completed" ]]
    exit 0
  fi
  sleep 2
done

echo "timeout waiting for job"
exit 1
