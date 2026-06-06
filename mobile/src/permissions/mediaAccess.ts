import { Camera } from "expo-camera";
import * as ImagePicker from "expo-image-picker";
import type { ImagePickerResult } from "expo-image-picker";
import { PermissionStatus, type PermissionResponse } from "expo-modules-core";
import { Platform } from "react-native";

export type MediaAccessState = Pick<PermissionResponse, "granted" | "status" | "canAskAgain">;

/** Android 13+ can pick a single image via the system photo picker without broad storage access. */
export function usesSystemPhotoPicker(): boolean {
  return Platform.OS === "android" && Platform.Version >= 33;
}

export async function getCameraAccessState(): Promise<MediaAccessState> {
  if (Platform.OS === "web") {
    return { granted: false, status: PermissionStatus.DENIED, canAskAgain: false };
  }
  const result = await Camera.getCameraPermissionsAsync();
  return {
    granted: result.granted,
    status: result.status,
    canAskAgain: result.canAskAgain,
  };
}

export async function requestCameraAccess(): Promise<MediaAccessState> {
  if (Platform.OS === "web") {
    return { granted: false, status: PermissionStatus.DENIED, canAskAgain: false };
  }
  const result = await Camera.requestCameraPermissionsAsync();
  return {
    granted: result.granted,
    status: result.status,
    canAskAgain: result.canAskAgain,
  };
}

export async function getPhotosAccessState(): Promise<MediaAccessState> {
  if (Platform.OS === "web") {
    return { granted: false, status: PermissionStatus.DENIED, canAskAgain: false };
  }

  if (usesSystemPhotoPicker()) {
    return {
      granted: true,
      status: PermissionStatus.GRANTED,
      canAskAgain: true,
    };
  }

  const result = await ImagePicker.getMediaLibraryPermissionsAsync();
  return {
    granted: result.granted,
    status: result.status,
    canAskAgain: result.canAskAgain,
  };
}

export async function requestPhotosAccess(): Promise<MediaAccessState> {
  if (Platform.OS === "web") {
    return { granted: false, status: PermissionStatus.DENIED, canAskAgain: false };
  }

  if (usesSystemPhotoPicker()) {
    return getPhotosAccessState();
  }

  const result = await ImagePicker.requestMediaLibraryPermissionsAsync();
  return {
    granted: result.granted,
    status: result.status,
    canAskAgain: result.canAskAgain,
  };
}

/** Request library access only when the platform requires it before opening the picker. */
export async function ensurePhotosAccessForPicker(): Promise<{
  canOpen: boolean;
  state: MediaAccessState;
}> {
  const current = await getPhotosAccessState();
  if (current.granted) {
    return { canOpen: true, state: current };
  }
  if (!current.canAskAgain) {
    return { canOpen: false, state: current };
  }
  const requested = await requestPhotosAccess();
  return { canOpen: requested.granted, state: requested };
}

export async function launchCardImagePicker(): Promise<ImagePickerResult> {
  return ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    quality: 0.9,
  });
}
