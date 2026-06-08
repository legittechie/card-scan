import Constants from "expo-constants";
import * as ImageManipulator from "expo-image-manipulator";
import { router, useNavigation } from "expo-router";
import { Suspense, lazy, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
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
import { ScanQueueModal } from "../src/components/ScanQueueModal";
import { SignOutHeaderButton } from "../src/components/SignOutHeaderButton";
import { usePendingScan, type PendingImage } from "../src/auth/PendingScanContext";
import { useAuth } from "../src/auth/SupabaseProvider";
import type { CameraAccessState } from "../src/permissions/cameraAccess";
import {
  ensurePhotosAccessForPicker,
  launchCardImagePicker,
} from "../src/permissions/mediaAccess";
import { debugLog } from "../src/debugLog";
import { useActiveJobs } from "../src/scan/ActiveJobsContext";

const ScanCameraPane = lazy(() =>
  import("../src/scan/ScanCameraPane").then((mod) => ({ default: mod.ScanCameraPane })),
);

const DEFAULT_CAMERA_ACCESS: CameraAccessState =
  Platform.OS === "web"
    ? { granted: false, status: PermissionStatus.DENIED, canAskAgain: false }
    : { granted: false, status: PermissionStatus.UNDETERMINED, canAskAgain: true };

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
  const navigation = useNavigation();
  const [cameraAccess, setCameraAccess] = useState<CameraAccessState>(DEFAULT_CAMERA_ACCESS);
  const { session, getAccessToken, supabase } = useAuth();
  const { setPendingImage, consumePendingImage } = usePendingScan();
  const {
    jobs: trackedJobs,
    addJob,
    removeJob,
    activeCount,
    queuedCount,
    processingCount,
  } = useActiveJobs();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [queuedMessage, setQueuedMessage] = useState<string | null>(null);
  const [queueModalVisible, setQueueModalVisible] = useState(false);
  const [requestingPermission, setRequestingPermission] = useState(false);
  const resumeStartedRef = useRef(false);
  const grantAttemptsRef = useRef(0);
  const openedSettingsRef = useRef(false);
  const isExpoGo = Constants.appOwnership === "expo";
  const apiTarget = __DEV__ ? getCardScanApiTarget() : null;
  const apiHost = __DEV__ ? new URL(getCardScanApiUrl()).hostname : null;

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => <SignOutHeaderButton />,
    });
  }, [navigation, session]);

  // Only re-check camera after returning from system Settings (user-initiated).
  useEffect(() => {
    const sub = AppState.addEventListener("change", (nextState) => {
      if (nextState !== "active" || !openedSettingsRef.current) return;
      openedSettingsRef.current = false;
      void import("../src/permissions/cameraAccess")
        .then((camera) => camera.getCameraAccessState())
        .then(setCameraAccess)
        .catch(() => {});
    });
    return () => sub.remove();
  }, []);

  const renderQueueModal = () => {
    if (!session || trackedJobs.length === 0) return null;
    return (
      <ScanQueueModal
        jobs={trackedJobs}
        onClose={() => setQueueModalVisible(false)}
        onDismiss={removeJob}
        visible={queueModalVisible}
      />
    );
  };

  const renderQueueLink = () => {
    if (!session || trackedJobs.length === 0) return null;
    const label =
      activeCount > 0
        ? `${activeCount} scan${activeCount === 1 ? "" : "s"} in progress`
        : `${trackedJobs.length} scan${trackedJobs.length === 1 ? "" : "s"} — view queue`;
    return (
      <TouchableOpacity
        accessibilityRole="button"
        onPress={() => setQueueModalVisible(true)}
        style={styles.queueLink}
      >
        <Text style={styles.queueLinkText}>{label}</Text>
      </TouchableOpacity>
    );
  };

  const uploadAndQueue = useCallback(
    async (file: PendingImage) => {
      setError(null);
      // #region agent log
      debugLog("scan.tsx", "upload_and_queue_start", { uriPrefix: file.uri.slice(0, 32) }, "E");
      // #endregion
      const token = await getAccessToken();
      if (!token) {
        // #region agent log
        debugLog("scan.tsx", "upload_and_queue_no_token", {}, "E");
        // #endregion
        redirectToAuthGate(file, setPendingImage);
        return;
      }

      setUploading(true);
      // #region agent log
      debugLog("scan.tsx", "uploading_true", {}, "D");
      // #endregion
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
        // #region agent log
        debugLog("scan.tsx", "upload_and_queue_success", { jobId: job_id }, "A");
        // #endregion
        addJob(job_id);
        setQueuedMessage("Card queued for scanning");
        setTimeout(() => setQueuedMessage(null), 3000);
      } catch (err) {
        // #region agent log
        debugLog("scan.tsx", "upload_and_queue_error", {
          message: err instanceof Error ? err.message : String(err),
        }, "A");
        // #endregion
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
        // #region agent log
        debugLog("scan.tsx", "uploading_false", {}, "D");
        // #endregion
        setUploading(false);
      }
    },
    [addJob, getAccessToken, setPendingImage, supabase],
  );

  useEffect(() => {
    if (!session || resumeStartedRef.current) return;
    const file = consumePendingImage();
    if (!file) return;

    // #region agent log
    debugLog("scan.tsx", "resume_pending_upload", {}, "E");
    // #endregion
    resumeStartedRef.current = true;
    void uploadAndQueue(file).finally(() => {
      resumeStartedRef.current = false;
    });
  }, [session, consumePendingImage, uploadAndQueue]);

  const onImageReady = async (uri: string) => {
    setError(null);
    try {
      // #region agent log
      debugLog("scan.tsx", "prepare_image_start", { uriPrefix: uri.slice(0, 32) }, "C");
      const prepareStartedAt = Date.now();
      // #endregion
      const file = await prepareImage(uri);
      // #region agent log
      debugLog("scan.tsx", "prepare_image_done", {
        elapsedMs: Date.now() - prepareStartedAt,
        outUriPrefix: file.uri.slice(0, 32),
      }, "C");
      // #endregion
      const token = await getAccessToken();
      if (token) {
        await uploadAndQueue(file);
      } else {
        redirectToAuthGate(file, setPendingImage);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not prepare image");
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

  const requestCameraPermission = async (): Promise<CameraAccessState> => {
    const camera = await import("../src/permissions/cameraAccess");
    const requested = await camera.requestCameraAccess();
    const refreshed = await camera.getCameraAccessState();
    const final = refreshed.granted ? refreshed : requested;
    setCameraAccess(final);
    return final;
  };

  const onGrantPermission = async () => {
    setError(null);
    setRequestingPermission(true);
    grantAttemptsRef.current += 1;
    const attempt = grantAttemptsRef.current;

    try {
      const final = await requestCameraPermission();
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
        openedSettingsRef.current = true;
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

  const apiTargetBanner =
    __DEV__ && apiTarget ? (
      <View style={styles.apiTargetBanner}>
        <Text style={styles.apiTargetBannerText}>
          API: {apiTarget} ({apiHost})
        </Text>
      </View>
    ) : null;

  if (cameraAccess.granted) {
    return (
      <Suspense
        fallback={
          <View style={styles.center}>
            <ActivityIndicator />
          </View>
        }
      >
        <ScanCameraPane
          sessionPresent={!!session}
          apiTargetBanner={apiTargetBanner}
          uploading={uploading}
          error={error}
          queuedMessage={queuedMessage}
          trackedJobs={trackedJobs}
          activeCount={activeCount}
          queuedCount={queuedCount}
          processingCount={processingCount}
          queueModalVisible={queueModalVisible}
          onSetQueueModalVisible={setQueueModalVisible}
          onRemoveJob={removeJob}
          onImageReady={onImageReady}
          onPickGallery={onPickGallery}
        />
      </Suspense>
    );
  }

  if (Platform.OS === "web") {
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

        {renderQueueLink()}
        {renderQueueModal()}
      </View>
    );
  }

  const deniedPermanently = cameraAccess.canAskAgain === false;
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

      {renderQueueLink()}
      {renderQueueModal()}
    </View>
  );
}

const styles = StyleSheet.create({
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
  queueLink: {
    marginTop: 20,
    padding: 8,
  },
  queueLinkText: {
    color: "#2563eb",
    fontSize: 15,
    fontWeight: "600",
    textAlign: "center",
  },
});
