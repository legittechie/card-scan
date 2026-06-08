# Mobile app (Expo)

Standalone iOS + Android client for the card-scan API. Implements the UX contract below.

## Setup

```bash
cd mobile
cp .env.example .env
# Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY (card_scan_part project)
npm ci
```

Dependency versions are pinned in `package.json` and `package-lock.json`. See [../docs/DEPENDENCIES.md](../docs/DEPENDENCIES.md) for upgrades.

**`mobile/.env` is the single source of truth** for Supabase credentials across this repo: the Expo app, local API (`make dev`), tests, and Cloud Run (`make sync-supabase` / `infra/api/deploy.sh`) all load `EXPO_PUBLIC_SUPABASE_*` from here.

**Important:** `mobile/.env` must use a **real, DNS-resolvable** Supabase URL. The placeholder `your-project-ref.supabase.co` causes `ERR_NAME_NOT_RESOLVED` at sign-in. For local Supabase on a phone, use your computer's LAN IP (`http://192.168.x.x:54321`), not `127.0.0.1`.

From repo root:

```bash
make mobile-install
make mobile-dev
```

**Phone and Mac must be on the same reachable Wi‑Fi** for `make mobile-dev` (LAN). Expo Go downloads the JS bundle from your Mac (e.g. `http://192.168.x.x:8081`). If that fails, use `make mobile-dev-tunnel` instead (see below).

## Environment

| Variable | Description |
|----------|-------------|
| `EXPO_PUBLIC_SUPABASE_URL` | Supabase project URL (e.g. `https://dlbdizdhttofpuosvdjb.supabase.co`) |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key (client-safe; backend/Cloud Run use the same values) |
| `EXPO_PUBLIC_CARD_SCAN_API_URL` | Production Cloud Run URL |
| `EXPO_PUBLIC_CARD_SCAN_API_URL_LOCAL` | Local API (`http://YOUR_LAN_IP:8080` while `make dev` runs) |
| `EXPO_PUBLIC_CARD_SCAN_API_TARGET` | `local` (default when LOCAL is set) or `production` |

**Production API:** Cloud Run must have `SUPABASE_URL` env and `SUPABASE_ANON_KEY` secret matching the same project (for JWT validation).

If sign-in succeeds but you are **sent back to login** (or see “signed out”) right after authenticating — especially after capturing a card first — the scan API is probably rejecting valid JWTs. Verify:

```bash
bash mobile/scripts/verify-api-auth.sh
```

If Supabase `/user` is **200** but `/scan` is **401**, sync Cloud Run to `mobile/.env`:

```bash
export GCP_PROJECT=your-gcp-project
bash infra/gcp/sync_supabase_from_mobile_env.sh
```

## Running

- **Expo Go (LAN):** `make mobile-dev` → scan QR in **Expo Go** (same Wi‑Fi as your Mac). Do **not** press `w` (web).
- **Expo Go (tunnel):** `make mobile-dev-tunnel` → use when you see `Failed to download remote update` on Android (phone cannot reach your Mac over LAN).
- **Simulator:** with Metro running, press `i` (iOS) or `a` (Android).
- **Local API (default):** `make dev` + `EXPO_PUBLIC_CARD_SCAN_API_TARGET=local` + `EXPO_PUBLIC_CARD_SCAN_API_URL_LOCAL=http://YOUR_LAN_IP:8080` → `make mobile-dev`
- **Production API from Expo Go:** set `EXPO_PUBLIC_CARD_SCAN_API_TARGET=production` in `mobile/.env` (or run `make mobile-dev-prod` once). Run `make sync-supabase` first so Cloud Run accepts your Supabase JWT. Phone needs internet (no LAN required for the API).

If Metro logs `Unable to resolve "react-native-web"`, run `npx expo install react-native-web react-dom @expo/metro-runtime` in `mobile/`.

If Metro fails with `expo-asset cannot be found`, run `npx expo install expo-asset expo-font` in `mobile/` (already pinned in `package.json`).

## Troubleshooting: `Failed to download remote update`

This message means **Expo Go could not download the JavaScript bundle** from your dev server (network), not a bug in scan/login code.

| Check | Action |
|-------|--------|
| Metro running? | Terminal should show `Metro waiting on exp://…` after `make mobile-dev` |
| Same network (LAN)? | Phone must reach your Mac IP on port **8081** (guest Wi‑Fi / VPN often blocks this) |
| LAN unreachable | Run `make mobile-dev-tunnel` and scan the **tunnel** QR code |
| Stale cache | `make mobile-dev-stop` then `make mobile-dev` with `-c` (already in Makefile) |
| Android USB | With phone plugged in: `adb reverse tcp:8081 tcp:8081` then `npx expo start --localhost` in `mobile/` |
| SDK mismatch | Expo Go must be **SDK 54** (matches `expo@~54` in this project) |
| macOS firewall | System Settings → Network → Firewall: allow incoming for Node / Terminal |

`updates.enabled` is **false** in `app.config.ts` so the app does not fetch OTA updates during development.

## Expo Go vs dev build

- **Expo Go (default):** `make mobile-dev` — requires **Expo Go SDK 54** on your phone (matches `expo@~54` in this project). Camera and image picker work in Expo Go.
- If you see “Project is incompatible with this version of Expo Go”, update Expo Go from the App Store / Play Store, or run `make mobile-install` after pulling the latest `mobile/package.json`.
- **Dev build (optional):** use EAS `eas build --profile development` when you need custom native modules or TestFlight; not required for this app’s current dependencies.

## Authentication

Use the **same Supabase project** as the Platform app. Routes:

- `/login` — sign in
- `/signup` — create account (in-app `signUp`)

**Try-then-auth:** The app opens on the scan screen for everyone. Camera and gallery work without signing in. When the user captures or picks an image, they are prompted to sign in or sign up; the prepared image is uploaded automatically after auth.

On every `POST /scan` and `GET /status/{job_id}`:

```http
Authorization: Bearer <session.access_token>
```

Do not embed service account keys or `SCAN_API_KEY` in the mobile app.

### Email verification (sign up)

Sign-up uses `auth.signUp` with email confirmation enabled in Supabase. The auth record is created as **unconfirmed** (`email_confirmed_at` is null) and **cannot sign in** until the user enters the OTP. No session is kept from sign-up; after OTP verification the app keeps the session returned by `verifyOtp`.

**Why you might still see a magic link:** Supabase chooses link vs code from the **email template body**. The **Confirm signup** template must use `{{ .Token }}`, not `{{ .ConfirmationURL }}`.

**Supabase dashboard (hosted project — required once):**

1. **Authentication** → **Providers** → **Email** — enable sign-up and **Confirm email**.
2. **Authentication** → **Email Templates** → **Confirm signup** — use OTP content (see `mobile/docs/supabase-email-otp-template.html`).
3. Remove any `{{ .ConfirmationURL }}` from that template.
4. Configure **SMTP** with a valid sender address.

Flow in the app:

1. User signs up with email + password → unconfirmed account + OTP email (no session).
2. User enters the code → email is confirmed and the app keeps the verified session.
3. User reaches the scan screen with an active session.

### “Error sending confirmation email” (HTTP 500)

If sign-up fails with **Error sending confirmation email** or `unexpected_failure`, the Supabase **mailer** on your project is failing — this is not fixed by adding redirect URLs in the app.

**Common cause (mailer logs):** `validation_error` / HTTP **422** — `Invalid 'from' field`. The **Sender email** in custom SMTP must be a real address, not a bare domain or placeholder.

| What to do | Action |
|------------|--------|
| Auth logs | Supabase Dashboard → **Authentication** → **Logs** — look for mailer/SMTP errors at signup time |
| SMTP | **Authentication** → **SMTP** — configure a provider (Resend, SendGrid, etc.); the built-in mailer is limited and can fail on some projects |
| **Sender / From** | Use `noreply@yourdomain.com` or `Card Scan <noreply@yourdomain.com>`. **Invalid:** `yourdomain.com`, `@yourdomain.com`, `noreply@`, spaces only, or an address your SMTP provider has not verified |
| Provider | In Resend/SendGrid/etc., verify the same domain or single sender you put in Supabase |
| Retry | After SMTP is configured, delete the test user under **Users**, then sign up again with a new address |

You can confirm from a terminal (same `EXPO_PUBLIC_SUPABASE_*` as `mobile/.env`):

```bash
curl -s -o /dev/null -w "%{http_code}" -X POST "$EXPO_PUBLIC_SUPABASE_URL/auth/v1/signup" \
  -H "apikey: $EXPO_PUBLIC_SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $EXPO_PUBLIC_SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"TestPass123!"}'
```

A response of **500** means the project mailer must be fixed in Supabase before the app can complete email confirmation.

### “Email rate limit exceeded” on sign up

Supabase’s **built-in email service** allows only a few auth emails per hour per project (signup, resend, password reset combined). Heavy testing hits this quickly.

| What to do | Action |
|------------|--------|
| Already signed up? | Use **Sign in** instead of signing up again. |
| Need another confirmation email? | Wait ~1 hour, then use **Resend** once (the app enforces a 60s cooldown between resends). |
| Ongoing development / production | Configure **custom SMTP** in Supabase → **Authentication** → **SMTP**, then raise limits under **Authentication** → **Rate limits**. |
| Local Supabase | In `config.toml`, adjust auth email rate limits or disable `enable_confirmations` for faster iteration. |

This limit is enforced by Supabase, not the mobile app.

## Permissions (Android & iOS)

Card Scan follows platform guidance: **no bulk permission prompts at app launch**. The Play Store / App Store listing may show that the app *can* use camera or photos (manifest / Info.plist declarations at install time). **Grants happen at runtime** when the user uses a feature.

| When | What happens |
|------|----------------|
| App opens | Scan screen loads; **no** system permission dialogs until the user acts |
| Tap shutter (camera) | In-app rationale if needed, then system **camera** prompt |
| Tap **Or Upload from Gallery** | On iOS / older Android, system **photos** prompt if required; Android 13+ uses the system photo picker without broad storage access |
| Camera denied in Settings | No live preview; user can still upload from gallery |
| Photos denied (where applicable) | Picker blocked with message + Open Settings; camera still available if allowed |

**Expo Go:** In development, system Settings control permissions for the **Expo Go** app, not a separate “Card Scan” entry. Standalone builds (`eas build`) use the bundle ID `io.gdca.cardscan`.

Purpose strings live in `app.config.ts` (camera + photos plugins and iOS `infoPlist`).

## Camera screen

1. User captures or picks a business card image (no login required to open the scan screen).
2. If not signed in, navigate to login/signup and stash the image; upload runs after auth on return to scan.
3. If signed in, `POST /scan` with multipart `file` and `Authorization` header.
4. On `200` with `{ "job_id": "..." }`, **navigate immediately** to the result screen.
5. Do **not** await extraction on this screen.

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
7. Copy hint: *Usually under 10 seconds when warm; first scan after idle can take up to 5 minutes.*

## API base URL

Configure per environment (dev/staging/prod). Never block the UI thread on vision latency.

## Manual QA checklist

| Test | Expected |
|------|----------|
| Fresh install → open app | Scan screen; **no** permission dialogs until camera or gallery is used |
| No session → app launch | Scan screen (guest banner when camera allowed) |
| Guest → capture | Login/signup prompt; no upload until auth |
| Sign up / sign in after capture | Returns to scan; upload starts; result screen |
| Signed in → capture | Direct upload → result |
| Camera denied in Settings | Rationale + Enable camera / Open Settings; gallery still offered |
| Photos denied (iOS / Android &lt; 13) | Gallery shows error; camera path unchanged if allowed |
| Android 13+ gallery | System picker opens without `READ_MEDIA_IMAGES` grant |
| Deep link `/result/:id` without session | Redirect to login |
| Invalid/expired token on poll | Redirect to login |
| Failed job | Error + Retry |

### Permission QA (Android device)

```bash
# Revoke camera, then open app and tap shutter — expect prompt or Settings path
adb shell pm revoke host.exp.exponent android.permission.CAMERA

# Revoke photos (pre-Android 13 / when declared); Android 13+ may use picker without this
adb shell pm revoke host.exp.exponent android.permission.READ_EXTERNAL_STORAGE
```

Replace `host.exp.exponent` with `io.gdca.cardscan` on standalone builds.

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
