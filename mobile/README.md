# Mobile app (Expo)

Standalone iOS + Android client for the card-scan API. Implements the UX contract below.

## Setup

```bash
cd mobile
cp .env.example .env
# Fill EXPO_PUBLIC_SUPABASE_* (same project as Platform) and EXPO_PUBLIC_CARD_SCAN_API_URL
npm install
```

From repo root:

```bash
make mobile-install
make mobile-dev
```

## Environment

| Variable | Description |
|----------|-------------|
| `EXPO_PUBLIC_SUPABASE_URL` | Platform Supabase URL |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key (client-safe) |
| `EXPO_PUBLIC_CARD_SCAN_API_URL` | e.g. `https://card-scan-api-itsdjyx6sa-uc.a.run.app` |

**Production API:** Cloud Run must have `SUPABASE_URL` env and `SUPABASE_ANON_KEY` secret matching the same project (for JWT validation).

## Running

- **Expo Go:** `npx expo start` → scan QR on device (iOS/Android).
- **Physical device + prod API:** use `.env` with prod URLs; device must reach HTTPS API.
- **Local API:** `make dev` on host + `EXPO_PUBLIC_CARD_SCAN_API_URL=http://YOUR_LAN_IP:8080` with `AUTH_MODE=disabled` on API.

## Authentication

Use the **same Supabase session** as the Platform app. On every `POST /scan` and `GET /status/{job_id}`:

```http
Authorization: Bearer <session.access_token>
```

Obtain `access_token` from Supabase Auth after sign-in (e.g. `session.access_token` in the client SDK). Do not embed service account keys or `SCAN_API_KEY` in the mobile app.

## Camera screen

1. User captures or picks a business card image.
2. `POST /scan` with multipart `file` field and the `Authorization` header above.
3. On `200` with `{ "job_id": "..." }`, **navigate immediately** to the result screen.
4. Do **not** await extraction on this screen.

## Result screen

1. Receive `job_id` via navigation params.
2. Show **animated skeleton** placeholders for all fields:
   - Name, Company, Title, Phone, Email, Website, Address, BusinessCategory, Others
3. Poll `GET /status/{job_id}` every **1.5s** (same `Authorization` header).
4. After 30s, use exponential backoff capped at **5s** between polls.
5. On `status: "completed"`:
   - Cross-fade skeleton to real values from `result`.
   - Show **Others** only when non-empty.
6. On `status: "failed"`:
   - Show `error` and a **Retry** button (new scan).
7. Copy hint: *Usually under 10 seconds when warm; first scan after idle may take up to a minute.*

## API base URL

Configure per environment (dev/staging/prod). Never block the UI thread on vision latency.

## Manual QA checklist

| Test | Expected |
|------|----------|
| No session → scan | Redirect to login |
| Login → capture → result | Skeleton appears, poll starts |
| Prod API + valid JWT | Job completes with fields |
| Invalid/expired token | 401 → refresh or re-login |
| Failed job | Error + Retry |
| Android + iOS | Camera permission + upload works |

## Example poll response

```json
{
  "job_id": "uuid",
  "status": "completed",
  "result": {
    "Name": "Jane Doe",
    "Company": "Acme Inc",
    "Others": "Fax: +1 555 0100\\nLinkedIn: /in/janedoe"
  },
  "raw_ocr_text": "…",
  "progress_hint": null
}
```
