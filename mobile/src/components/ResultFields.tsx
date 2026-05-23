import { StyleSheet, Text, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";

import { FieldRowSkeleton } from "./FieldSkeleton";
import { FIELD_LABELS, type BusinessCardFields } from "../types/cardScan";

type Props = {
  result: BusinessCardFields | null;
  loading: boolean;
};

function FieldRow({ label, value }: { label: string; value: string }) {
  return (
    <Animated.View entering={FadeIn.duration(400)} style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </Animated.View>
  );
}

export function ResultFields({ result, loading }: Props) {
  if (loading || !result) {
    return (
      <View>
        {FIELD_LABELS.map(({ label }) => (
          <FieldRowSkeleton key={label} labelWidth={label.length * 8} />
        ))}
      </View>
    );
  }

  return (
    <View>
      {FIELD_LABELS.map(({ key, label }) => {
        const value = result[key];
        if (!value) return null;
        return <FieldRow key={key} label={label} value={value} />;
      })}
      {result.Others ? (
        <FieldRow label="Others" value={result.Others} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    marginBottom: 16,
  },
  label: {
    fontSize: 12,
    fontWeight: "600",
    color: "#6b7280",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  value: {
    fontSize: 16,
    color: "#111827",
    lineHeight: 22,
  },
});
