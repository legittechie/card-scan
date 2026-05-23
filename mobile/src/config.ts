import Constants from "expo-constants";

const PLACEHOLDER_HOSTS = new Set([
  "your-project-ref.supabase.co",
  "localhost",
  "127.0.0.1",
]);

function readEnv(key: string, extraKey: string): string | undefined {
  const fromEnv = process.env[key];
  if (fromEnv) return fromEnv;
  const extra = Constants.expoConfig?.extra as Record<string, unknown> | undefined;
  const value = extra?.[extraKey];
  return typeof value === "string" ? value : undefined;
}

function assertResolvableHttpUrl(raw: string, label: string): string {
  const url = raw.replace(/\/$/, "");
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    throw new Error(`${label} is not a valid URL: ${url}`);
  }

  if (PLACEHOLDER_HOSTS.has(host) || host.includes("your-project-ref")) {
    throw new Error(
      `${label} still uses a placeholder host (${host}). Copy real values from Platform/.env.local into mobile/.env, then restart Expo.`,
    );
  }

  if (host === "127.0.0.1" || host === "localhost") {
    throw new Error(
      `${label} points to ${host}. On a physical phone use your Mac's LAN IP (e.g. http://192.168.x.x:54321) or a hosted *.supabase.co URL.`,
    );
  }

  return url;
}

export function getCardScanApiUrl(): string {
  const url = readEnv("EXPO_PUBLIC_CARD_SCAN_API_URL", "cardScanApiUrl");
  if (!url) {
    throw new Error("EXPO_PUBLIC_CARD_SCAN_API_URL is not configured");
  }
  return assertResolvableHttpUrl(url, "EXPO_PUBLIC_CARD_SCAN_API_URL");
}

export function getSupabaseConfig(): { url: string; anonKey: string } {
  const url = readEnv("EXPO_PUBLIC_SUPABASE_URL", "supabaseUrl");
  const anonKey = readEnv("EXPO_PUBLIC_SUPABASE_ANON_KEY", "supabaseAnonKey");
  if (!url || !anonKey) {
    throw new Error("EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY are required");
  }
  if (anonKey.includes("your_supabase") || anonKey.length < 20) {
    throw new Error(
      "EXPO_PUBLIC_SUPABASE_ANON_KEY looks like a placeholder. Copy the anon key from Platform/.env.local into mobile/.env.",
    );
  }
  return { url: assertResolvableHttpUrl(url, "EXPO_PUBLIC_SUPABASE_URL"), anonKey };
}
