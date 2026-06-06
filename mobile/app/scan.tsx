import { CameraView, useCameraPermissions } from "expo-camera";
import Constants from "expo-constants";
import * as ImageManipulator from "expo-image-manipulator";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  Linking,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { PermissionStatus } from "expo-modules-core";

import {
  API_SESSION_REJECTED_MESSAGE,
  AUTH_REQUIRED_MESSAGE,
  isAuthError,
  uploadScan,
} from "../src/api/cardScanClient";
import {
  getCardScanApiTarget,
  getCardScanApiUrl,
} from "../src/config";
import { usePendingScan, type PendingImage } from "../src/auth/PendingScanContext";
import { useAuth } from "../src/auth/SupabaseProvider";
import { ensurePhotosAccessForPicker, launchCardImagePicker } from "../src/permissions/mediaAccess";

function redirectToAuthGate(file: PendingImage, setPendingImage: (f: PendingImage) => void): void {
  setPendingImage(file);
  router.replace({ pathname: "/login", params: { fromScan: "1" } });
}

async function prepareImage(uri: string): Promise<PendingImage> {
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
  const [permission, requestPermission, getPermission] = useCameraPermissions();
  const { session, getAccessToken, supabase } = useAuth();
  const { setPendingImage, consumePendingImage } = usePendingScan();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requestingPermission, setRequestingPermission] = useState(false);
  const resumeStartedRef = useRef(false);
  const grantAttemptsRef = useRef(0);
  const isExpoGo = Constants.appOwnership === "expo";
  const apiTarget = __DEV__ ? getCardScanApiTarget() : null;
  const apiHost = __DEV__ ? new URL(getCardScanApiUrl()).hostname : null;

  useFocusEffect(
    useCallback(() => {
      void getPermission();
    }, [getPermission]),
  );

  useEffect(() => {
    const sub = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") {
        void getPermission();
      }
    });
    return () => sub.remove();
  }, [getPermission]);

  const uploadAndNavigate = useCallback(
    async (file: PendingImage) => {
      setError(null);
      const token = await getAccessToken();
      if (!token) {
        redirectToAuthGate(file, setPendingImage);
        return;
      }

      setUploading(true);
      try {
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
        const message = err instanceof Error ? err.message : "Upload failed";
        if (isAuthError(message)) {
          const token = await getAccessToken();
          const apiTarget = getCardScanApiTarget();
          const apiHost = new URL(getCardScanApiUrl()).hostname;
          if (token && message === API_SESSION_REJECTED_MESSAGE) {
            setError(
              apiTarget === "production"
                ? "You're signed in, but the production scan API rejected your JWT. Run `make sync-supabase`, redeploy the API (`infra/api/deploy.sh`), or set EXPO_PUBLIC_CARD_SCAN_API_TARGET=local for local testing."
                : `You're signed in, but the scan API at ${apiHost} rejected your session. Ensure \`make dev\` is running and EXPO_PUBLIC_CARD_SCAN_API_TARGET=local, then restart Expo with -c.`,
            );
            return;
          }
          if (!token || message === AUTH_REQUIRED_MESSAGE) {
            redirectToAuthGate(file, setPendingImage);
            return;
          }
          setError(message);
          return;
        }
        setError(message);
      } finally {
        setUploading(false);
      }
    },
    [getAccessToken, setPendingImage, supabase],
  );

  useEffect(() => {
    if (!session || resumeStartedRef.current) return;
    const file = consumePendingImage();
    if (!file) return;

    resumeStartedRef.current = true;
    void uploadAndNavigate(file).finally(() => {
      resumeStartedRef.current = false;
    });
  }, [session, consumePendingImage, uploadAndNavigate]);

  const onImageReady = async (uri: string) => {
    setError(null);
    try {
      const file = await prepareImage(uri);
      const token = await getAccessToken();
      if (token) {
        await uploadAndNavigate(file);
      } else {
        redirectToAuthGate(file, setPendingImage);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not prepare image");
    }
  };

  const onCapture = async () => {
    setError(null);

    if (!permission?.granted) {
      setRequestingPermission(true);
      try {
        await requestPermission();
        const refreshed = await getPermission();
        if (!refreshed.granted) {
          setError("Camera access is required to capture a card.");
          return;
        }
        setError(null);
        return;
      } finally {
        setRequestingPermission(false);
      }
    }

    const photo = await cameraRef.current?.takePictureAsync({ quality: 0.9 });
    if (photo?.uri) {
      await onImageReady(photo.uri);
    }
  };

  const onPickGallery = async () => {
    setError(null);
    setRequestingPermission(true);
    let canOpen = false;
    let state: Awaited<ReturnType<typeof ensurePhotosAccessForPicker>>["state"] = {
      granted: false,
      canAskAgain: true,
      status: PermissionStatus.UNDETERMINED,
    };
    try {
      const access = await ensurePhotosAccessForPicker();
      canOpen = access.canOpen;
      state = access.state;
    } finally {
      setRequestingPermission(false);
    }
    if (!canOpen) {
      if (state.canAskAgain === false) {
        setError(
          "Photo access is turned off. Open Settings to allow photos, or use the camera if enabled.",
        );
      } else {
        setError("Photo library access is required to pick a card image.");
      }
      return;
    }

    const result = await launchCardImagePicker();
    if (!result.canceled && result.assets[0]?.uri) {
      await onImageReady(result.assets[0].uri);
    }
  };

  const onGrantPermission = async () => {
    setError(null);
    setRequestingPermission(true);
    grantAttemptsRef.current += 1;
    const attempt = grantAttemptsRef.current;

    try {
      let result = await requestPermission();
      const refreshed = await getPermission();
      const final = refreshed.granted ? refreshed : result;

      if (final.granted) {
        grantAttemptsRef.current = 0;
        return;
      }

      if (Platform.OS === "web") {
        setError(
          "Camera blocked in the browser. Use Choose photo to scan, or allow camera in the site settings (lock icon in the address bar) and tap Allow browser camera again.",
        );
        return;
      }

      const shouldOpenSettings = final.canAskAgain === false || attempt >= 2;

      if (shouldOpenSettings) {
        await Linking.openSettings();
        setError(
          isExpoGo
            ? "Enable Camera for Expo Go in Settings, then return here. Or upload from Gallery below."
            : "Enable Camera in Settings, then return here. Or upload from Gallery below.",
        );
        return;
      }

      setError("Tap Allow on the system dialog, or upload from Gallery below.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not request camera permission");
    } finally {
      setRequestingPermission(false);
    }
  };

  if (!permission) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  if (!permission.granted && Platform.OS === "web") {
    return (
      <View style={styles.center}>
        <Text style={styles.titleWeb}>Scan a business card</Text>
        <Text style={styles.message}>
          Live camera scanning works in Expo Go on iOS or Android. In the browser, upload a
          photo of your card below.
        </Text>

        {error ? <Text style={styles.permissionError}>{error}</Text> : null}

        <TouchableOpacity
          accessibilityRole="button"
          activeOpacity={0.7}
          disabled={uploading}
          onPress={onPickGallery}
          style={[styles.button, styles.primaryWebButton]}
        >
          {uploading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Choose photo to scan</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          accessibilityRole="button"
          activeOpacity={0.7}
          disabled={requestingPermission || uploading}
          onPress={onGrantPermission}
          style={[styles.button, styles.galleryButton]}
        >
          {requestingPermission ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Allow browser camera</Text>
          )}
        </TouchableOpacity>

        {!session ? (
          <TouchableOpacity
            accessibilityRole="button"
            activeOpacity={0.7}
            onPress={() => router.push("/login")}
            style={styles.linkButton}
          >
            <Text style={styles.linkText}>Sign in</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    );
  }

  if (!permission.granted) {
    const deniedPermanently = permission.canAskAgain === false;
    return (
      <View style={styles.center}>
        <Text style={styles.titleWeb}>Scan a business card</Text>

        {error ? <Text style={styles.permissionError}>{error}</Text> : null}

        <TouchableOpacity
          accessibilityRole="button"
          activeOpacity={0.7}
          disabled={requestingPermission}
          onPress={onGrantPermission}
          style={[styles.button, requestingPermission && styles.buttonDisabled]}
        >
          {requestingPermission ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>
              {deniedPermanently ? "Open Camera" : "Enable camera"}
            </Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          accessibilityRole="button"
          activeOpacity={0.7}
          disabled={uploading}
          onPress={onPickGallery}
          style={[styles.button, styles.galleryButton]}
        >
          <Text style={styles.buttonText}>Or Upload from Gallery</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView ref={cameraRef} style={styles.camera} facing="back" />

      {__DEV__ && apiTarget ? (
        <View style={styles.apiTargetBanner}>
          <Text style={styles.apiTargetBannerText}>
            API: {apiTarget} ({apiHost})
          </Text>
        </View>
      ) : null}

      {!session ? (
        <View style={[styles.guestBanner, __DEV__ && apiTarget ? styles.guestBannerWithApiBadge : null]}>
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

      <View style={styles.controls}>
        <TouchableOpacity
          activeOpacity={0.7}
          disabled={uploading}
          onPress={onCapture}
          style={styles.captureButton}
        >
          <View style={styles.captureInner} />
        </TouchableOpacity>
        <TouchableOpacity
          activeOpacity={0.7}
          disabled={uploading}
          onPress={onPickGallery}
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
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24 },
  titleWeb: {
    fontSize: 22,
    fontWeight: "700",
    marginBottom: 12,
    textAlign: "center",
  },
  message: { textAlign: "center", marginBottom: 16, fontSize: 16 },
  primaryWebButton: {
    backgroundColor: "#2563eb",
  },
  linkButton: {
    marginTop: 20,
    padding: 8,
  },
  linkText: {
    color: "#2563eb",
    fontSize: 15,
    fontWeight: "600",
  },
  apiTargetBanner: {
    position: "absolute",
    top: 48,
    left: 16,
    right: 16,
    backgroundColor: "rgba(37, 99, 235, 0.9)",
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 6,
    zIndex: 10,
  },
  apiTargetBannerText: {
    color: "#fff",
    fontSize: 11,
    textAlign: "center",
    fontWeight: "600",
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
  guestBannerWithApiBadge: {
    top: 88,
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
  button: {
    backgroundColor: "#111827",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    minWidth: 200,
    alignItems: "center",
  },
  galleryButton: {
    marginTop: 12,
    backgroundColor: "#374151",
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: { color: "#fff", fontWeight: "600" },
  permissionError: {
    color: "#dc2626",
    textAlign: "center",
    marginBottom: 16,
    fontSize: 14,
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
});
