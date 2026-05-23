import { CameraView, useCameraPermissions } from "expo-camera";
import * as ImageManipulator from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import { useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { uploadScan } from "../src/api/cardScanClient";
import { useAuth } from "../src/auth/SupabaseProvider";

async function prepareImage(uri: string): Promise<{ uri: string; mimeType: string; name: string }> {
  const manipulated = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: 2048 } }],
    { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG },
  );
  return {
    uri: manipulated.uri,
    mimeType: "image/jpeg",
    name: "card.jpg",
  };
}

export default function ScanScreen() {
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const { getAccessToken, supabase, signOut } = useAuth();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const uploadAndNavigate = async (uri: string) => {
    setError(null);
    setUploading(true);
    try {
      const file = await prepareImage(uri);
      const refreshSession = async () => {
        await supabase.auth.refreshSession();
      };
      const { job_id } = await uploadScan(
        file.uri,
        file.mimeType,
        file.name,
        getAccessToken,
        refreshSession,
      );
      router.push(`/result/${job_id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const onCapture = async () => {
    const photo = await cameraRef.current?.takePictureAsync({ quality: 0.9 });
    if (photo?.uri) {
      await uploadAndNavigate(photo.uri);
    }
  };

  const onPickGallery = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.9,
    });
    if (!result.canceled && result.assets[0]?.uri) {
      await uploadAndNavigate(result.assets[0].uri);
    }
  };

  if (!permission) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.center}>
        <Text style={styles.message}>Camera access is required to scan cards.</Text>
        <Pressable onPress={requestPermission} style={styles.button}>
          <Text style={styles.buttonText}>Grant permission</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView ref={cameraRef} style={styles.camera} facing="back" />

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

      <View style={styles.controls}>
        <Pressable disabled={uploading} onPress={onPickGallery} style={styles.secondaryButton}>
          <Text style={styles.secondaryText}>Gallery</Text>
        </Pressable>
        <Pressable disabled={uploading} onPress={onCapture} style={styles.captureButton}>
          <View style={styles.captureInner} />
        </Pressable>
        <Pressable
          disabled={uploading}
          onPress={() => signOut().then(() => router.replace("/login"))}
          style={styles.secondaryButton}
        >
          <Text style={styles.secondaryText}>Sign out</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  camera: { flex: 1 },
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24 },
  message: { textAlign: "center", marginBottom: 16, fontSize: 16 },
  controls: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    paddingVertical: 24,
    paddingHorizontal: 16,
    backgroundColor: "#111827",
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
  button: {
    backgroundColor: "#111827",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
  },
  buttonText: { color: "#fff", fontWeight: "600" },
  secondaryButton: { padding: 12 },
  secondaryText: { color: "#e5e7eb", fontSize: 14 },
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
    top: 48,
    left: 16,
    right: 16,
    backgroundColor: "#fef2f2",
    padding: 12,
    borderRadius: 8,
  },
  errorText: { color: "#b91c1c" },
});
