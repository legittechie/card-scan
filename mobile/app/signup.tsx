import { Link, router } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { getAuthErrorMessage, isEmailRateLimitError } from "../src/auth/authErrors";
import { useAuth } from "../src/auth/SupabaseProvider";
import { SignupVerifyOtp } from "../src/components/SignupVerifyOtp";

const RESEND_COOLDOWN_SECONDS = 60;

export default function SignupScreen() {
  const { signUp, verifySignupOtp, resendSignupOtp } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [awaitingOtp, setAwaitingOtp] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown((seconds) => Math.max(0, seconds - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  const onSubmit = async () => {
    setError(null);
    setInfo(null);
    setOtp("");
    setAwaitingOtp(false);
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }

    setLoading(true);
    try {
      const outcome = await signUp(email.trim(), password);
      if (outcome.status === "already_registered") {
        setError(
          "This email may already be registered. Sign in instead, or resend a code if you never verified.",
        );
        return;
      }
      if (outcome.status === "confirm_otp") {
        setAwaitingOtp(true);
        setResendCooldown(RESEND_COOLDOWN_SECONDS);
        return;
      }
      setInfo("Your account is ready — email confirmation is not required for this project.");
      router.replace("/scan");
    } catch (err) {
      setError(getAuthErrorMessage(err));
      if (isEmailRateLimitError(err)) {
        setResendCooldown(RESEND_COOLDOWN_SECONDS);
      }
    } finally {
      setLoading(false);
    }
  };

  const onVerifyOtp = async () => {
    setError(null);
    setInfo(null);
    setVerifying(true);
    try {
      const { hasSession } = await verifySignupOtp(email.trim(), otp, password);
      if (!hasSession) {
        setError("Verification succeeded but the session could not be saved. Try signing in.");
        return;
      }
      router.replace("/scan");
    } catch (err) {
      setError(getAuthErrorMessage(err));
    } finally {
      setVerifying(false);
    }
  };

  const onResend = async () => {
    if (resendCooldown > 0) return;
    setError(null);
    setInfo(null);
    setResending(true);
    try {
      await resendSignupOtp(email.trim());
      setInfo("A new verification code was sent. Check your inbox and spam folder.");
      setResendCooldown(RESEND_COOLDOWN_SECONDS);
    } catch (err) {
      setError(getAuthErrorMessage(err));
      if (isEmailRateLimitError(err)) {
        setResendCooldown(RESEND_COOLDOWN_SECONDS);
      }
    } finally {
      setResending(false);
    }
  };

  if (awaitingOtp) {
    return (
      <SignupVerifyOtp
        email={email.trim()}
        error={error}
        info={info}
        otp={otp}
        onOtpChange={setOtp}
        onResend={onResend}
        onVerify={onVerifyOtp}
        resendCooldown={resendCooldown}
        resending={resending}
        verifying={verifying}
      />
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={styles.container}
    >
      <Text style={styles.title}>Create account</Text>
      <Text style={styles.subtitle}>Create an account to scan business cards</Text>

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
      <TextInput
        secureTextEntry
        placeholder="Confirm password"
        style={styles.input}
        value={confirmPassword}
        onChangeText={setConfirmPassword}
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}
      {info ? <Text style={styles.info}>{info}</Text> : null}

      <Pressable
        disabled={loading}
        onPress={onSubmit}
        style={[styles.button, loading && styles.buttonDisabled]}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Sign up</Text>
        )}
      </Pressable>

      <View style={styles.footer}>
        <Text style={styles.footerText}>Already have an account? </Text>
        <Link href="/login" style={styles.link}>
          Sign in
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
  info: {
    color: "#059669",
    marginBottom: 12,
    lineHeight: 20,
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
