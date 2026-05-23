import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

export function FieldSkeleton({ height = 20 }: { height?: number }) {
  const opacity = useSharedValue(0.35);

  useEffect(() => {
    opacity.value = withRepeat(withTiming(0.85, { duration: 900 }), -1, true);
  }, [opacity]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return (
    <Animated.View style={[styles.bar, { height }, animatedStyle]} />
  );
}

export function FieldRowSkeleton({ labelWidth = 80 }: { labelWidth?: number }) {
  return (
    <View style={styles.row}>
      <View style={[styles.labelStub, { width: labelWidth }]} />
      <FieldSkeleton height={18} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    gap: 8,
    marginBottom: 16,
  },
  labelStub: {
    height: 12,
    borderRadius: 4,
    backgroundColor: "#d1d5db",
    marginBottom: 4,
  },
  bar: {
    borderRadius: 6,
    backgroundColor: "#e5e7eb",
  },
});
