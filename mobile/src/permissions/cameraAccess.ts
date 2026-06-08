import { Camera } from "expo-camera";
import { PermissionStatus, type PermissionResponse } from "expo-modules-core";
import { Platform } from "react-native";

export type CameraAccessState = Pick<PermissionResponse, "granted" | "status" | "canAskAgain">;

export async function getCameraAccessState(): Promise<CameraAccessState> {
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

export async function requestCameraAccess(): Promise<CameraAccessState> {
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
