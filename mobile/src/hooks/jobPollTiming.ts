export const INITIAL_INTERVAL_MS = 1500;
export const BACKOFF_CAP_MS = 5000;
export const BACKOFF_AFTER_MS = 30_000;

export function nextDelayMs(startedAt: number, pollCount: number): number {
  const elapsed = Date.now() - startedAt;
  if (elapsed < BACKOFF_AFTER_MS) {
    return INITIAL_INTERVAL_MS;
  }
  const exponent = Math.max(0, pollCount - Math.floor(BACKOFF_AFTER_MS / INITIAL_INTERVAL_MS));
  return Math.min(INITIAL_INTERVAL_MS * 2 ** exponent, BACKOFF_CAP_MS);
}

export function isTerminalStatus(status: string): boolean {
  return status === "completed" || status === "failed";
}
