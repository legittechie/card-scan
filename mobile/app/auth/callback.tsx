import { router } from "expo-router";
import { useURL } from "expo-linking";
import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { AppMetrics } from "expo-observe";

import { useAuth } from "../../src/auth/SupabaseProvider";

function isSupabaseAuthCallbackUrl(url: string): boolean {
  return (
    url.includes("access_token=") ||
    url.includes("refresh_token=") ||
    url.includes("token_hash=") ||
    url.includes("code=") ||
    url.includes("type=signup") ||
    url.includes("type=email") ||
    url.includes("type=magiclink")
  );
}

/** Handles Supabase signup email-confirm deep links (cardscan:// or exp:// auth/callback). */
export default function AuthCallbackScreen() {
  const url = useURL();
  const { confirmEmailFromLink } = useAuth();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!url) return;
    if (!isSupabaseAuthCallbackUrl(url)) {
      AppMetrics.markInteractive();
      router.replace("/scan");
      return;
    }

    let cancelled = false;
    void (async () => {
      const result = await confirmEmailFromLink(url);
      if (cancelled) return;

      if (!result.ok) {
        AppMetrics.markInteractive();
        setError(result.reason ?? "Could not confirm your email from this link.");
        return;
      }

      AppMetrics.markInteractive();
      router.replace("/scan");
    })();

    return () => {
      cancelled = true;
    };
  }, [url, confirmEmailFromLink]);

  return (
    <View style={styles.center}>
      {error ? (
        <>
          <Text style={styles.errorTitle}>Email link could not be opened</Text>
          <Text style={styles.error}>{error}</Text>
          <Text style={styles.hint}>
            Add the redirect URL from the sign-up screen to Supabase → Authentication → URL
            configuration (see mobile/README.md), then sign up again for a fresh email.
          </Text>
        </>
      ) : (
        <>
          <ActivityIndicator size="large" />
          <Text style={styles.message}>Confirming your email…</Text>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
    backgroundColor: "#fff",
  },
  message: { marginTop: 16, fontSize: 16, color: "#374151" },
  errorTitle: {
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 8,
    textAlign: "center",
  },
  error: {
    color: "#dc2626",
    textAlign: "center",
    marginBottom: 12,
  },
  hint: {
    fontSize: 14,
    color: "#6b7280",
    textAlign: "center",
    lineHeight: 20,
  },
});
