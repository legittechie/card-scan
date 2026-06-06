import { Redirect, router, useLocalSearchParams } from "expo-router";
import { useEffect } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { isApiSessionRejected, isAuthError } from "../../src/api/cardScanClient";
import { useAuth } from "../../src/auth/SupabaseProvider";
import { ResultFields } from "../../src/components/ResultFields";
import { useJobPoll } from "../../src/hooks/useJobPoll";

export default function ResultScreen() {
  const { jobId } = useLocalSearchParams<{ jobId: string }>();
  const { session, loading } = useAuth();
  const { data, error: pollError } = useJobPoll(jobId);

  useEffect(() => {
    if (pollError && isApiSessionRejected(pollError)) {
      return;
    }
    if (isAuthError(pollError)) {
      router.replace("/login");
    }
  }, [pollError]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (!session) {
    return <Redirect href="/login" />;
  }

  const loadingJob = !data || (data.status !== "completed" && data.status !== "failed");
  const failed = data?.status === "failed";

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {data?.progress_hint && loadingJob ? (
        <Text style={styles.hint}>{data.progress_hint}</Text>
      ) : null}

      {pollError && isApiSessionRejected(pollError) ? (
        <Text style={styles.error}>
          You're signed in, but the scan server rejected your session. The API must use the same
          Supabase project as this app.
        </Text>
      ) : null}

      {pollError && !isAuthError(pollError) ? (
        <Text style={styles.error}>{pollError}</Text>
      ) : null}

      {failed ? (
        <View style={styles.failedBox}>
          <Text style={styles.failedTitle}>Scan failed</Text>
          <Text style={styles.failedMessage}>{data?.error ?? "Unknown error"}</Text>
          <Pressable onPress={() => router.replace("/scan")} style={styles.retryButton}>
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      ) : (
        <ResultFields result={data?.result ?? null} loading={loadingJob} />
      )}

      {loadingJob && !failed ? (
        <Text style={styles.footerHint}>
          Usually under 10 seconds when warm; first scan after idle can take up to 5 minutes.
        </Text>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  container: {
    padding: 20,
    paddingBottom: 40,
  },
  hint: {
    fontSize: 14,
    color: "#2563eb",
    marginBottom: 16,
  },
  error: {
    color: "#dc2626",
    marginBottom: 12,
  },
  failedBox: {
    backgroundColor: "#fef2f2",
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
  },
  failedTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#991b1b",
    marginBottom: 8,
  },
  failedMessage: {
    color: "#7f1d1d",
    marginBottom: 16,
  },
  retryButton: {
    alignSelf: "flex-start",
    backgroundColor: "#111827",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  retryText: {
    color: "#fff",
    fontWeight: "600",
  },
  footerHint: {
    marginTop: 24,
    fontSize: 13,
    color: "#6b7280",
    fontStyle: "italic",
  },
});
