import Constants from "expo-constants";

const PLACEHOLDER_HOSTS = new Set([
  "your-project-ref.supabase.co",
  "localhost",
  "127.0.0.1",
]);

function readExtraString(extraKey: string): string | undefined {
  const extra = Constants.expoConfig?.extra as Record<string, unknown> | undefined;
  const value = extra?.[extraKey];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function assertResolvableHttpUrl(raw: string, label: string): string {
  const cleaned = raw.trim().replace(/^['"]|['"]$/g, "");
  const url = cleaned.replace(/\/$/, "");
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    throw new Error(`${label} is not a valid URL: ${url}`);
  }

  if (PLACEHOLDER_HOSTS.has(host) || host.includes("your-project-ref")) {
    throw new Error(
      `${label} still uses a placeholder host (${host}). Set real values in mobile/.env, then restart Expo.`,
    );
  }

  if (host === "127.0.0.1" || host === "localhost") {
    throw new Error(
      `${label} points to ${host}. On a physical phone use your Mac's LAN IP (e.g. http://192.168.x.x:54321) or a hosted *.supabase.co URL.`,
    );
  }

  return url;
}

export type CardScanApiTarget = "local" | "production";

function isCloudRunHost(host: string): boolean {
  return host.endsWith(".run.app");
}

function parseApiTarget(
  raw: string | undefined,
  hasLocalUrl: boolean,
): CardScanApiTarget {
  const normalized = raw?.trim().toLowerCase();
  if (normalized === "production" || normalized === "prod") {
    return "production";
  }
  if (normalized === "local") {
    return "local";
  }
  // Default: local when a local URL is configured, otherwise production.
  return hasLocalUrl ? "local" : "production";
}

/** Which scan API endpoint the app uses (`EXPO_PUBLIC_CARD_SCAN_API_TARGET`). */
export function getCardScanApiTarget(): CardScanApiTarget {
  const extra = Constants.expoConfig?.extra as Record<string, unknown> | undefined;
  const localUrl =
    process.env.EXPO_PUBLIC_CARD_SCAN_API_URL_LOCAL ||
    (typeof extra?.cardScanApiUrlLocal === "string" ? extra.cardScanApiUrlLocal : undefined);
  const targetRaw =
    process.env.EXPO_PUBLIC_CARD_SCAN_API_TARGET ||
    (typeof extra?.cardScanApiTarget === "string" ? extra.cardScanApiTarget : undefined);
  return parseApiTarget(targetRaw, !!localUrl);
}

export function getCardScanApiUrl(): string {
  const extra = Constants.expoConfig?.extra as Record<string, unknown> | undefined;
  // Static process.env access so Metro inlines EXPO_PUBLIC_* at bundle time.
  const localUrl =
    process.env.EXPO_PUBLIC_CARD_SCAN_API_URL_LOCAL ||
    (typeof extra?.cardScanApiUrlLocal === "string" ? extra.cardScanApiUrlLocal : undefined);
  const prodUrl =
    process.env.EXPO_PUBLIC_CARD_SCAN_API_URL ||
    (typeof extra?.cardScanApiUrl === "string" ? extra.cardScanApiUrl : undefined);
  const target = getCardScanApiTarget();
  const useLocal = target === "local";
  const url = useLocal ? localUrl : prodUrl;
  const label = useLocal
    ? "EXPO_PUBLIC_CARD_SCAN_API_URL_LOCAL"
    : "EXPO_PUBLIC_CARD_SCAN_API_URL";
  if (!url) {
    throw new Error(
      useLocal
        ? "EXPO_PUBLIC_CARD_SCAN_API_URL_LOCAL is not configured (Mac LAN IP + port 8080, or set EXPO_PUBLIC_CARD_SCAN_API_TARGET=production)"
        : "EXPO_PUBLIC_CARD_SCAN_API_URL is not configured",
    );
  }
  return assertResolvableHttpUrl(url, label);
}

/** True when the resolved API host is Cloud Run (HTTPS production). */
export function isProductionCardScanApi(): boolean {
  return getCardScanApiTarget() === "production";
}

export function getSupabaseConfig(): { url: string; anonKey: string } {
  // Embedded launches: values live in app.config `extra` (native manifest).
  // OTA launches: `extra` may be absent — Metro must inline static process.env.* at bundle time.
  const url =
    readExtraString("supabaseUrl") ?? process.env.EXPO_PUBLIC_SUPABASE_URL;
  const anonKey =
    readExtraString("supabaseAnonKey") ?? process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error("EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY are required");
  }
  if (anonKey.includes("your_supabase") || anonKey.length < 20) {
    throw new Error(
      "EXPO_PUBLIC_SUPABASE_ANON_KEY looks like a placeholder. Set the anon key in mobile/.env.",
    );
  }
  return { url: assertResolvableHttpUrl(url, "EXPO_PUBLIC_SUPABASE_URL"), anonKey };
}
