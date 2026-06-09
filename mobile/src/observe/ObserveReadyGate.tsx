import { AppMetrics } from "expo-observe";
import { useEffect, type ReactNode } from "react";

import { useAuth } from "../auth/SupabaseProvider";

/** Marks time-to-interactive once Supabase session hydration completes. */
export function ObserveReadyGate({ children }: { children: ReactNode }) {
  const { loading } = useAuth();

  useEffect(() => {
    if (!loading) {
      AppMetrics.markInteractive();
    }
  }, [loading]);

  return <>{children}</>;
}
