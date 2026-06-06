import { router } from "expo-router";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

type SignupVerifyOtpProps = {
  email: string;
  otp: string;
  info: string | null;
  error: string | null;
  verifying: boolean;
  resending: boolean;
  resendCooldown: number;
  onOtpChange: (value: string) => void;
  onVerify: () => void;
  onResend: () => void;
};

export function SignupVerifyOtp({
  email,
  otp,
  info,
  error,
  verifying,
  resending,
  resendCooldown,
  onOtpChange,
  onVerify,
  onResend,
}: SignupVerifyOtpProps) {
  const otpReady = otp.trim().length >= 6;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Enter verification code</Text>
      <Text style={styles.subtitle}>
        We sent a 6-digit code to {email}. Enter it below to finish creating your account.
      </Text>

      <TextInput
        autoComplete="one-time-code"
        keyboardType="number-pad"
        maxLength={8}
        placeholder="123456"
        style={styles.otpInput}
        textContentType="oneTimeCode"
        value={otp}
        onChangeText={(value) => onOtpChange(value.replace(/\D/g, ""))}
      />

      {info ? <Text style={styles.info}>{info}</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Pressable
        accessibilityRole="button"
        disabled={verifying || !otpReady}
        onPress={onVerify}
        style={[styles.button, (verifying || !otpReady) && styles.buttonDisabled]}
      >
        {verifying ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Verify and continue</Text>
        )}
      </Pressable>

      <Pressable
        accessibilityRole="button"
        disabled={resending || resendCooldown > 0}
        onPress={onResend}
        style={[styles.secondaryButton, (resending || resendCooldown > 0) && styles.buttonDisabled]}
      >
        {resending ? (
          <ActivityIndicator color="#2563eb" />
        ) : (
          <Text style={styles.secondaryButtonText}>
            {resendCooldown > 0 ? `Resend code in ${resendCooldown}s` : "Resend code"}
          </Text>
        )}
      </Pressable>

      <Pressable accessibilityRole="button" onPress={() => router.replace("/login")} style={styles.linkButton}>
        <Text style={styles.linkButtonText}>Back to sign in</Text>
      </Pressable>
    </View>
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
  otpInput: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginBottom: 16,
    fontSize: 24,
    letterSpacing: 6,
    textAlign: "center",
    fontVariant: ["tabular-nums"],
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
  secondaryButton: {
    marginTop: 12,
    paddingVertical: 12,
    alignItems: "center",
  },
  secondaryButtonText: {
    color: "#2563eb",
    fontSize: 16,
    fontWeight: "600",
  },
  linkButton: {
    marginTop: 8,
    paddingVertical: 12,
    alignItems: "center",
  },
  linkButtonText: {
    color: "#6b7280",
    fontSize: 15,
    fontWeight: "600",
  },
});
