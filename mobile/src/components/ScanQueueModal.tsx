import { router } from "expo-router";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import type { TrackedJob } from "../types/cardScan";

type Props = {
  visible: boolean;
  jobs: TrackedJob[];
  onClose: () => void;
  onDismiss: (jobId: string) => void;
};

function shortJobId(jobId: string): string {
  return jobId.slice(0, 8);
}

function rowTitle(job: TrackedJob): string {
  if (job.result?.Name) return job.result.Name;
  if (job.result?.Company) return job.result.Company;
  return `Scan ${shortJobId(job.jobId)}`;
}

function statusLabel(status: TrackedJob["status"]): string {
  switch (status) {
    case "queued":
      return "Queued";
    case "processing":
      return "Scanning";
    case "completed":
      return "Done";
    case "failed":
      return "Failed";
    default:
      return status;
  }
}

function statusColor(status: TrackedJob["status"]): string {
  switch (status) {
    case "queued":
      return "#6b7280";
    case "processing":
      return "#2563eb";
    case "completed":
      return "#059669";
    case "failed":
      return "#dc2626";
    default:
      return "#6b7280";
  }
}

function rowSubtitle(job: TrackedJob): string {
  if (job.status === "failed") {
    return job.error ?? job.pollError ?? "Scan failed";
  }
  if (job.pollError) return job.pollError;
  if (job.progress_hint) return job.progress_hint;
  if (job.status === "completed" && job.result?.Company) return job.result.Company;
  return "";
}

export function ScanQueueModal({ visible, jobs, onClose, onDismiss }: Props) {
  return (
    <Modal animationType="slide" transparent visible={visible} onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>Scan queue</Text>
            <Pressable accessibilityRole="button" onPress={onClose} style={styles.closeButton}>
              <Text style={styles.closeText}>Close</Text>
            </Pressable>
          </View>

          <Text style={styles.footerHint}>Scans run one at a time on the server.</Text>

          <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
            {jobs.length === 0 ? (
              <Text style={styles.empty}>No scans yet this session.</Text>
            ) : (
              jobs.map((job) => {
                const terminal = job.status === "completed" || job.status === "failed";
                const subtitle = rowSubtitle(job);

                return (
                  <View key={job.jobId} style={styles.row}>
                    <Pressable
                      accessibilityRole="button"
                      disabled={!terminal}
                      onPress={() => {
                        if (!terminal) return;
                        onClose();
                        router.push(`/result/${job.jobId}`);
                      }}
                      style={({ pressed }) => [
                        styles.rowMain,
                        !terminal && styles.rowMainDisabled,
                        pressed && terminal && styles.rowMainPressed,
                      ]}
                    >
                      <View style={styles.rowTop}>
                        <View
                          style={[
                            styles.statusChip,
                            { backgroundColor: `${statusColor(job.status)}22` },
                          ]}
                        >
                          <Text style={[styles.statusText, { color: statusColor(job.status) }]}>
                            {statusLabel(job.status)}
                          </Text>
                        </View>
                        <Text style={styles.rowTitle}>{rowTitle(job)}</Text>
                      </View>
                      {subtitle ? (
                        <Text
                          style={[styles.subtitle, job.status === "failed" && styles.subtitleError]}
                          numberOfLines={2}
                        >
                          {subtitle}
                        </Text>
                      ) : null}
                    </Pressable>

                    {terminal ? (
                      <Pressable
                        accessibilityRole="button"
                        onPress={() => onDismiss(job.jobId)}
                        style={styles.dismissButton}
                      >
                        <Text style={styles.dismissText}>Dismiss</Text>
                      </Pressable>
                    ) : null}
                  </View>
                );
              })
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: "70%",
    paddingBottom: 24,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
  },
  closeButton: {
    padding: 8,
  },
  closeText: {
    color: "#2563eb",
    fontWeight: "600",
    fontSize: 15,
  },
  footerHint: {
    paddingHorizontal: 20,
    paddingBottom: 12,
    fontSize: 13,
    color: "#6b7280",
    fontStyle: "italic",
  },
  list: {
    paddingHorizontal: 12,
  },
  listContent: {
    paddingBottom: 16,
  },
  empty: {
    textAlign: "center",
    color: "#6b7280",
    paddingVertical: 24,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e5e7eb",
  },
  rowMain: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 8,
  },
  rowMainDisabled: {
    opacity: 0.95,
  },
  rowMainPressed: {
    backgroundColor: "#f3f4f6",
    borderRadius: 8,
  },
  rowTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 4,
  },
  statusChip: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  rowTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
  },
  subtitle: {
    fontSize: 13,
    color: "#6b7280",
    marginTop: 2,
  },
  subtitleError: {
    color: "#b91c1c",
  },
  dismissButton: {
    paddingHorizontal: 10,
    paddingVertical: 12,
  },
  dismissText: {
    fontSize: 13,
    color: "#6b7280",
    fontWeight: "500",
  },
});
