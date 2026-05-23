import { ExpoConfig, ConfigContext } from "expo/config";

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: "Card Scan",
  slug: "card-scan",
  version: "1.0.0",
  orientation: "portrait",
  scheme: "cardscan",
  userInterfaceStyle: "automatic",
  newArchEnabled: false,
  ios: {
    supportsTablet: true,
    bundleIdentifier: "io.gdca.cardscan",
    infoPlist: {
      NSCameraUsageDescription: "Capture business cards for scanning.",
      NSPhotoLibraryUsageDescription: "Pick a business card photo to scan.",
    },
  },
  android: {
    package: "io.gdca.cardscan",
    permissions: ["CAMERA", "READ_MEDIA_IMAGES"],
  },
  plugins: [
    "expo-router",
    "expo-asset",
    "expo-font",
    [
      "expo-camera",
      {
        cameraPermission: "Allow Card Scan to capture business cards.",
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
  },
  extra: {
    cardScanApiUrl: process.env.EXPO_PUBLIC_CARD_SCAN_API_URL,
    supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
    supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  },
});
