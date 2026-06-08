import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { fetchJobStatus } from "../api/cardScanClient";
import { useAuth } from "../auth/SupabaseProvider";
import { isTerminalStatus, nextDelayMs } from "../hooks/jobPollTiming";
import type { JobStatusResponse, TrackedJob } from "../types/cardScan";

type ActiveJobsContextValue = {
  jobs: TrackedJob[];
  addJob: (jobId: string) => void;
  removeJob: (jobId: string) => void;
  activeCount: number;
  queuedCount: number;
  processingCount: number;
  failedCount: number;
};

const ActiveJobsContext = createContext<ActiveJobsContextValue | null>(null);

function responseToTracked(job: TrackedJob, body: JobStatusResponse): TrackedJob {
  return {
    ...job,
    status: body.status,
    progress_hint: body.progress_hint,
    result: body.result,
    error: body.error,
    pollError: null,
  };
}

export function ActiveJobsProvider({ children }: { children: React.ReactNode }) {
  const { getAccessToken, supabase, session } = useAuth();
  const userId = session?.user?.id ?? null;
  const [jobs, setJobs] = useState<TrackedJob[]>([]);
  const jobsRef = useRef(jobs);
  const pollCountRef = useRef(0);
  const pollStartedAtRef = useRef(Date.now());

  jobsRef.current = jobs;

  const addJob = useCallback((jobId: string) => {
    setJobs((prev) => {
      if (prev.some((j) => j.jobId === jobId)) {
        return prev;
      }
      const entry: TrackedJob = {
        jobId,
        submittedAt: Date.now(),
        status: "queued",
        progress_hint: "Waiting in queue",
        result: null,
        error: null,
        pollError: null,
      };
      return [entry, ...prev];
    });
    pollCountRef.current = 0;
    pollStartedAtRef.current = Date.now();
  }, []);

  const removeJob = useCallback((jobId: string) => {
    setJobs((prev) => prev.filter((j) => j.jobId !== jobId));
  }, []);

  const counts = useMemo(() => {
    let queuedCount = 0;
    let processingCount = 0;
    let failedCount = 0;
    for (const job of jobs) {
      if (job.status === "queued") queuedCount += 1;
      else if (job.status === "processing") processingCount += 1;
      else if (job.status === "failed") failedCount += 1;
    }
    return {
      queuedCount,
      processingCount,
      failedCount,
      activeCount: queuedCount + processingCount,
    };
  }, [jobs]);

  useEffect(() => {
    if (!userId) return;
    if (jobs.length === 0) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const refreshSession = async () => {
      await supabase.auth.refreshSession();
    };

    const poll = async () => {
      if (cancelled) return;

      const currentJobs = jobsRef.current;
      const activeJobs = currentJobs.filter((j) => !isTerminalStatus(j.status));
      if (activeJobs.length === 0) return;

      const results = await Promise.all(
        activeJobs.map(async (job) => {
          try {
            const body = await fetchJobStatus(job.jobId, getAccessToken, refreshSession);
            return { jobId: job.jobId, body, pollError: null as string | null };
          } catch (err) {
            return {
              jobId: job.jobId,
              body: null,
              pollError: err instanceof Error ? err.message : "Poll failed",
            };
          }
        }),
      );

      if (cancelled) return;

      setJobs((prev) =>
        prev.map((job) => {
          const update = results.find((r) => r.jobId === job.jobId);
          if (!update) return job;
          if (update.pollError) {
            return { ...job, pollError: update.pollError };
          }
          if (update.body) {
            return responseToTracked(job, update.body);
          }
          return job;
        }),
      );

      pollCountRef.current += 1;

      const stillActive = activeJobs.some((job) => {
        const update = results.find((r) => r.jobId === job.jobId);
        if (!update) return true;
        if (update.pollError) return true;
        if (update.body && !isTerminalStatus(update.body.status)) return true;
        return false;
      });
      if (!stillActive) return;

      const delay = nextDelayMs(pollStartedAtRef.current, pollCountRef.current);
      timer = setTimeout(poll, delay);
    };

    void poll();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [userId, getAccessToken, supabase, jobs.length]);

  const value = useMemo(
    () => ({
      jobs,
      addJob,
      removeJob,
      ...counts,
    }),
    [jobs, addJob, removeJob, counts],
  );

  return <ActiveJobsContext.Provider value={value}>{children}</ActiveJobsContext.Provider>;
}

export function useActiveJobs(): ActiveJobsContextValue {
  const ctx = useContext(ActiveJobsContext);
  if (!ctx) {
    throw new Error("useActiveJobs must be used within ActiveJobsProvider");
  }
  return ctx;
}
