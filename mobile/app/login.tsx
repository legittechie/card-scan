import { Link, router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  TouchableOpacity,
  Text,
  TextInput,
  View,
} from "react-native";

import { getAuthErrorMessage } from "../src/auth/authErrors";
import { useAuth } from "../src/auth/SupabaseProvider";

export default function LoginScreen() {
  const { signIn } = useAuth();
  const { confirmed, fromScan } = useLocalSearchParams<{ confirmed?: string; fromScan?: string }>();
  const emailConfirmed = confirmed === "1";
  const pendingScan = fromScan === "1";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async () => {
    setError(null);
    setLoading(true);
    try {
      await signIn(email.trim(), password);
      router.replace("/scan");
    } catch (err) {
      setError(getAuthErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={styles.container}
    >
      <Text style={styles.title}>Card Scan</Text>
      <Text style={styles.subtitle}>Sign in to scan and save results</Text>

      {emailConfirmed ? (
        <Text style={styles.success}>
          Your email is confirmed. Sign in with the password you created during sign up.
        </Text>
      ) : null}

      {pendingScan && !emailConfirmed ? (
        <Text style={styles.pendingScan}>
          Sign in or create an account to scan the card you selected. Your photo is saved and will
          upload after you authenticate.
        </Text>
      ) : null}

      <TextInput
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        placeholder="Email"
        style={styles.input}
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        secureTextEntry
        placeholder="Password"
        style={styles.input}
        value={password}
        onChangeText={setPassword}
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <TouchableOpacity
        activeOpacity={0.7}
        disabled={loading}
        onPress={onSubmit}
        style={[styles.button, loading && styles.buttonDisabled]}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Sign in</Text>
        )}
      </TouchableOpacity>

      <View style={styles.footer}>
        <Text style={styles.footerText}>No account yet? </Text>
        <Link href="/signup" style={styles.link}>
          Create an account
        </Link>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    justifyContent: "center",
    backgroundColor: "#fff",
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    color: "#6b7280",
    marginBottom: 24,
  },
  success: {
    fontSize: 15,
    color: "#059669",
    backgroundColor: "#ecfdf5",
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    lineHeight: 22,
  },
  pendingScan: {
    fontSize: 15,
    color: "#1f2937",
    backgroundColor: "#f3f4f6",
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    lineHeight: 22,
  },
  input: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 12,
    fontSize: 16,
  },
  error: {
    color: "#dc2626",
    marginBottom: 12,
  },
  button: {
    backgroundColor: "#111827",
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  footer: {
    flexDirection: "row",
    justifyContent: "center",
    marginTop: 20,
    flexWrap: "wrap",
  },
  footerText: {
    color: "#6b7280",
    fontSize: 15,
  },
  link: {
    color: "#2563eb",
    fontSize: 15,
    fontWeight: "600",
  },
});
