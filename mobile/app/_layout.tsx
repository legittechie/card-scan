import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";

import { SupabaseProvider } from "../src/auth/SupabaseProvider";

export default function RootLayout() {
  return (
    <SupabaseProvider>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerShown: true }}>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="login" options={{ title: "Sign in" }} />
        <Stack.Screen name="scan" options={{ title: "Scan card" }} />
        <Stack.Screen name="result/[jobId]" options={{ title: "Extracting…" }} />
      </Stack>
    </SupabaseProvider>
  );
}
