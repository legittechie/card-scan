import { Stack } from "expo-router";
import type { HeaderBackButtonProps } from "@react-navigation/elements";
import { AppMetricsRoot } from "expo-observe";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import { PendingScanProvider } from "../src/auth/PendingScanContext";
import { SupabaseProvider } from "../src/auth/SupabaseProvider";
import { HeaderBackButton } from "../src/components/HeaderBackButton";
import { ObserveReadyGate } from "../src/observe/ObserveReadyGate";
import { ActiveJobsProvider } from "../src/scan/ActiveJobsContext";

const headerWithBack = {
  headerBackVisible: false,
  headerLeft: (props: HeaderBackButtonProps) => <HeaderBackButton {...props} />,
};

function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SupabaseProvider>
        <ObserveReadyGate>
          <PendingScanProvider>
            <ActiveJobsProvider>
              <StatusBar style="auto" />
              <Stack
                screenOptions={{
                  headerShown: true,
                  ...headerWithBack,
                }}
              >
                <Stack.Screen name="index" options={{ headerShown: false }} />
                <Stack.Screen name="auth/callback" options={{ headerShown: false }} />
                <Stack.Screen name="login" options={{ title: "Sign in" }} />
                <Stack.Screen name="signup" options={{ title: "Sign up" }} />
                <Stack.Screen name="scan" options={{ title: "Scan card" }} />
                <Stack.Screen name="result/[jobId]" options={{ title: "Scan result" }} />
              </Stack>
            </ActiveJobsProvider>
          </PendingScanProvider>
        </ObserveReadyGate>
      </SupabaseProvider>
    </GestureHandlerRootView>
  );
}

export default AppMetricsRoot.wrap(RootLayout);
