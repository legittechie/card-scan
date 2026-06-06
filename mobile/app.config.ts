import { ExpoConfig, ConfigContext } from "expo/config";

const CAMERA_PERMISSION =
  "Card Scan uses the camera to photograph business cards you choose to scan. Photos are processed to extract contact details and are not used for background recording or unrelated purposes.";

const PHOTOS_PERMISSION =
  "Card Scan lets you choose a single business card photo from your library to scan. Only the image you select is used to extract contact details.";

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: "Card Scan",
  slug: "card-scan",
  version: "1.0.0",
  orientation: "portrait",
  scheme: "cardscan",
  userInterfaceStyle: "automatic",
  platforms: ["ios", "android"],
  // Reanimated 4 (and worklets) require the New Architecture; SDK 54 supports it
  // and Expo Go already runs this app under New Arch. Old Arch breaks the Gradle build.
  newArchEnabled: true,
  ios: {
    supportsTablet: true,
    bundleIdentifier: "io.gdca.cardscan",
    infoPlist: {
      NSCameraUsageDescription: CAMERA_PERMISSION,
      NSPhotoLibraryUsageDescription: PHOTOS_PERMISSION,
    },
  },
  android: {
    package: "io.gdca.cardscan",
    permissions: ["CAMERA"],
    intentFilters: [
      {
        action: "VIEW",
        autoVerify: false,
        data: [
          {
            scheme: "cardscan",
            pathPrefix: "/auth/callback",
          },
        ],
        category: ["BROWSABLE", "DEFAULT"],
      },
    ],
  },
  plugins: [
    "expo-router",
    "expo-asset",
    "expo-font",
    [
      "expo-camera",
      {
        cameraPermission: CAMERA_PERMISSION,
      },
    ],
    [
      "expo-image-picker",
      {
        photosPermission: PHOTOS_PERMISSION,
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
  },
  // EAS Update (OTA). `eas update:configure` sets updates.url to
  // https://u.expo.dev/<projectId> after `eas init` assigns the projectId below.
  runtimeVersion: {
    policy: "appVersion",
  },
  updates: {
    enabled: true,
    url: "https://u.expo.dev/dd349c45-297a-4bef-a595-27a0f70bd586",
  },
  extra: {
    cardScanApiUrl: process.env.EXPO_PUBLIC_CARD_SCAN_API_URL,
    cardScanApiUrlLocal: process.env.EXPO_PUBLIC_CARD_SCAN_API_URL_LOCAL,
    cardScanApiTarget: process.env.EXPO_PUBLIC_CARD_SCAN_API_TARGET,
    supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
    supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
    // Assigned by `eas init`. Required for EAS Build/Update. Not a secret.
    eas: {
      projectId: process.env.EAS_PROJECT_ID ?? "dd349c45-297a-4bef-a595-27a0f70bd586",
    },
  },
});
