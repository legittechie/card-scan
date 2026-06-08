import type { HeaderBackButtonProps } from "@react-navigation/elements";
import { router } from "expo-router";
import { Platform, Pressable, StyleSheet, Text } from "react-native";

/** Always-visible back control; uses stack history or falls back to scan. */
export function HeaderBackButton({ tintColor }: HeaderBackButtonProps) {
  const color = tintColor ?? "#2563eb";

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Go back"
      hitSlop={8}
      onPress={() => {
        if (router.canGoBack()) {
          router.back();
        } else {
          router.replace("/scan");
        }
      }}
      style={styles.button}
    >
      <Text style={[styles.chevron, { color }]}>{Platform.OS === "ios" ? "‹" : "←"}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    marginLeft: Platform.OS === "ios" ? 0 : 4,
    minWidth: 32,
    paddingHorizontal: 4,
    paddingVertical: 4,
    justifyContent: "center",
    alignItems: "center",
  },
  chevron: {
    fontSize: Platform.OS === "ios" ? 34 : 22,
    fontWeight: "600",
    lineHeight: Platform.OS === "ios" ? 34 : 24,
  },
});
