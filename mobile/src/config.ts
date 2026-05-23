import Constants from "expo-constants";

export function getCardScanApiUrl(): string {
  const url =
    process.env.EXPO_PUBLIC_CARD_SCAN_API_URL ??
    (Constants.expoConfig?.extra?.cardScanApiUrl as string | undefined);
  if (!url) {
    throw new Error("EXPO_PUBLIC_CARD_SCAN_API_URL is not configured");
  }
  return url.replace(/\/$/, "");
}

export function getSupabaseConfig(): { url: string; anonKey: string } {
  const url =
    process.env.EXPO_PUBLIC_SUPABASE_URL ??
    (Constants.expoConfig?.extra?.supabaseUrl as string | undefined);
  const anonKey =
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ??
    (Constants.expoConfig?.extra?.supabaseAnonKey as string | undefined);
  if (!url || !anonKey) {
    throw new Error("EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY are required");
  }
  return { url, anonKey };
}
