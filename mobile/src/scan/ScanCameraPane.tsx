import { CameraView } from "expo-camera";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { ScanQueueBanner } from "../components/ScanQueueBanner";
import { ScanQueueModal } from "../components/ScanQueueModal";
import type { TrackedJob } from "../types/cardScan";

type Props = {
  sessionPresent: boolean;
  apiTargetBanner: React.ReactNode;
  uploading: boolean;
  error: string | null;
  queuedMessage: string | null;
  trackedJobs: TrackedJob[];
  activeCount: number;
  queuedCount: number;
  processingCount: number;
  queueModalVisible: boolean;
  onSetQueueModalVisible: (visible: boolean) => void;
  onRemoveJob: (jobId: string) => void;
  onImageReady: (uri: string) => Promise<void>;
  onPickGallery: () => Promise<void>;
};

export function ScanCameraPane({
  sessionPresent,
  apiTargetBanner,
  uploading,
  error,
  queuedMessage,
  trackedJobs,
  activeCount,
  queuedCount,
  processingCount,
  queueModalVisible,
  onSetQueueModalVisible,
  onRemoveJob,
  onImageReady,
  onPickGallery,
}: Props) {
  const cameraRef = useRef<CameraView>(null);

  const onCapture = async () => {
    const photo = await cameraRef.current?.takePictureAsync({ quality: 0.9 });
    if (photo?.uri) {
      await onImageReady(photo.uri);
    }
  };
  const [cameraActive, setCameraActive] = useState(AppState.currentState === "active");

  useEffect(() => {
    const sub = AppState.addEventListener("change", (nextState) => {
      setCameraActive(nextState === "active");
    });
    return () => sub.remove();
  }, []);

  const renderQueueModal = () => {
    if (!sessionPresent || trackedJobs.length === 0) return null;
    return (
      <ScanQueueModal
        jobs={trackedJobs}
        onClose={() => onSetQueueModalVisible(false)}
        onDismiss={onRemoveJob}
        visible={queueModalVisible}
      />
    );
  };

  const renderQueueBanner = () => {
    if (!sessionPresent || trackedJobs.length === 0) return null;
    return (
      <ScanQueueBanner
        activeCount={activeCount}
        processingCount={processingCount}
        queuedCount={queuedCount}
        totalCount={trackedJobs.length}
        onPress={() => onSetQueueModalVisible(true)}
      />
    );
  };

  return (
    <View style={styles.container}>
      {cameraActive ? (
        <CameraView ref={cameraRef} style={styles.camera} facing="back" />
      ) : (
        <View style={[styles.camera, styles.cameraPaused]} />
      )}

      {apiTargetBanner}

      {!sessionPresent ? (
        <View style={styles.guestBanner}>
          <Text style={styles.guestBannerText}>
            Capture a card — sign in to extract details
          </Text>
        </View>
      ) : null}

      {uploading ? (
        <View style={styles.overlay}>
          <ActivityIndicator size="large" color="#fff" />
          <Text style={styles.overlayText}>Uploading…</Text>
        </View>
      ) : null}

      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      {queuedMessage ? (
        <View style={styles.queuedBox}>
          <Text style={styles.queuedText}>{queuedMessage}</Text>
        </View>
      ) : null}

      {renderQueueBanner()}
      {renderQueueModal()}

      <View style={styles.controls}>
        <TouchableOpacity
          activeOpacity={0.7}
          disabled={uploading}
          onPress={() => void onCapture().catch(() => {})}
          style={styles.captureButton}
        >
          <View style={styles.captureInner} />
        </TouchableOpacity>
        <TouchableOpacity
          activeOpacity={0.7}
          disabled={uploading}
          onPress={() => void onPickGallery()}
          style={styles.galleryLink}
        >
          <Text style={styles.galleryLinkText}>Or Upload from Gallery</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  camera: {
    ...StyleSheet.absoluteFillObject,
  },
  cameraPaused: {
    backgroundColor: "#000",
  },
  guestBanner: {
    position: "absolute",
    top: 48,
    left: 16,
    right: 16,
    backgroundColor: "rgba(17, 24, 39, 0.85)",
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
  },
  guestBannerText: {
    color: "#f9fafb",
    fontSize: 14,
    textAlign: "center",
  },
  controls: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 20,
    elevation: 20,
    alignItems: "center",
    paddingTop: 20,
    paddingBottom: 28,
    paddingHorizontal: 16,
    backgroundColor: "#111827",
    gap: 16,
  },
  galleryLink: {
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  galleryLinkText: {
    color: "#e5e7eb",
    fontSize: 15,
    fontWeight: "500",
    textAlign: "center",
  },
  captureButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 4,
    borderColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  captureInner: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#fff",
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  overlayText: { color: "#fff", fontSize: 16 },
  errorBox: {
    position: "absolute",
    top: 96,
    left: 16,
    right: 16,
    backgroundColor: "#fef2f2",
    padding: 12,
    borderRadius: 8,
  },
  errorText: { color: "#b91c1c" },
  queuedBox: {
    position: "absolute",
    top: 96,
    left: 16,
    right: 16,
    backgroundColor: "rgba(5, 150, 105, 0.95)",
    padding: 10,
    borderRadius: 8,
    zIndex: 12,
  },
  queuedText: {
    color: "#fff",
    textAlign: "center",
    fontSize: 14,
    fontWeight: "600",
  },
});
