import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

type Props = {
  activeCount: number;
  queuedCount: number;
  processingCount: number;
  totalCount: number;
  onPress: () => void;
};

function bannerLabel(
  queuedCount: number,
  processingCount: number,
  activeCount: number,
  totalCount: number,
): string {
  if (processingCount > 0 && queuedCount > 0) {
    return `${processingCount} scanning · ${queuedCount} queued`;
  }
  if (processingCount > 0) {
    return processingCount === 1 ? "1 scanning" : `${processingCount} scanning`;
  }
  if (queuedCount > 0) {
    return queuedCount === 1 ? "1 in queue" : `${queuedCount} in queue`;
  }
  if (activeCount > 0) {
    return `${activeCount} in queue`;
  }
  return `${totalCount} scan${totalCount === 1 ? "" : "s"}`;
}

export function ScanQueueBanner({
  activeCount,
  queuedCount,
  processingCount,
  totalCount,
  onPress,
}: Props) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.banner, pressed && styles.bannerPressed]}
    >
      {processingCount > 0 ? (
        <ActivityIndicator color="#fff" size="small" style={styles.spinner} />
      ) : null}
      <Text style={styles.text}>
        {bannerLabel(queuedCount, processingCount, activeCount, totalCount)}
      </Text>
      <Text style={styles.chevron}>›</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 160,
    zIndex: 15,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(37, 99, 235, 0.95)",
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
  },
  bannerPressed: {
    opacity: 0.9,
  },
  spinner: {
    marginRight: 8,
  },
  text: {
    flex: 1,
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  chevron: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "600",
    marginLeft: 8,
  },
});
