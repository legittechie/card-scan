// Web Crypto for Supabase PKCE — before any auth client loads.
import "./src/auth/cryptoPolyfill";
// Must be first — before expo-router loads any screens (fixes dead Pressables in Expo Go).
import "react-native-gesture-handler";
import "expo-router/entry";
