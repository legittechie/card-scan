import { useEffect, useRef, useState } from "react";

import { fetchJobStatus } from "../api/cardScanClient";
import { useAuth } from "../auth/SupabaseProvider";
import type { JobStatusResponse } from "../types/cardScan";

const INITIAL_INTERVAL_MS = 1500;
const BACKOFF_CAP_MS = 5000;
const BACKOFF_AFTER_MS = 30_000;

function nextDelayMs(startedAt: number, pollCount: number): number {
  const elapsed = Date.now() - startedAt;
  if (elapsed < BACKOFF_AFTER_MS) {
    return INITIAL_INTERVAL_MS;
  }
  const exponent = Math.max(0, pollCount - Math.floor(BACKOFF_AFTER_MS / INITIAL_INTERVAL_MS));
  return Math.min(INITIAL_INTERVAL_MS * 2 ** exponent, BACKOFF_CAP_MS);
}

export function useJobPoll(jobId: string | undefined) {
  const { getAccessToken, supabase } = useAuth();
  const [data, setData] = useState<JobStatusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pollCount = useRef(0);
  const startedAt = useRef(Date.now());

  useEffect(() => {
    if (!jobId) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    pollCount.current = 0;
    startedAt.current = Date.now();
    setData(null);
    setError(null);

    const refreshSession = async () => {
      await supabase.auth.refreshSession();
    };

    const poll = async () => {
      try {
        const body = await fetchJobStatus(jobId, getAccessToken, refreshSession);
        if (cancelled) return;
        setData(body);
        setError(null);
        pollCount.current += 1;

        if (body.status === "completed" || body.status === "failed") {
          return;
        }

        const delay = nextDelayMs(startedAt.current, pollCount.current);
        timer = setTimeout(poll, delay);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Poll failed");
        pollCount.current += 1;
        const delay = nextDelayMs(startedAt.current, pollCount.current);
        timer = setTimeout(poll, delay);
      }
    };

    poll();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [jobId, getAccessToken, supabase]);

  return { data, error };
}
