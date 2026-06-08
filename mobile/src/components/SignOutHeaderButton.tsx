import { router } from "expo-router";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
} from "react-native";

import { useAuth } from "../auth/SupabaseProvider";

export function SignOutHeaderButton() {
  const { session, signOut } = useAuth();
  const [loading, setLoading] = useState(false);

  const onPress = useCallback(() => {
    Alert.alert("Log out?", undefined, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Log out",
        style: "destructive",
        onPress: async () => {
          setLoading(true);
          try {
            await signOut();
            router.replace("/login");
          } catch (err) {
            Alert.alert(
              "Could not log out",
              err instanceof Error ? err.message : "Please try again.",
            );
          } finally {
            setLoading(false);
          }
        },
      },
    ]);
  }, [signOut]);

  if (!session) {
    return null;
  }

  return (
    <Pressable
      accessibilityRole="button"
      disabled={loading}
      onPress={onPress}
      style={styles.button}
    >
      {loading ? (
        <ActivityIndicator color="#2563eb" size="small" />
      ) : (
        <Text style={styles.text}>Log out</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    marginRight: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    minWidth: 56,
    alignItems: "center",
    justifyContent: "center",
  },
  text: {
    color: "#2563eb",
    fontSize: 16,
    fontWeight: "600",
  },
});
