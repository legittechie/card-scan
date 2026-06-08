const DEBUG_ENDPOINT =
  "http://127.0.0.1:7262/ingest/9912285a-bd24-4919-94f5-31a65319f8ba";
const DEBUG_SESSION = "bcb55a";

export function debugLog(
  location: string,
  message: string,
  data?: Record<string, unknown>,
  hypothesisId = "",
  runId = "pre-fix",
): void {
  const payload = {
    sessionId: DEBUG_SESSION,
    location,
    message,
    data,
    hypothesisId,
    runId,
    timestamp: Date.now(),
  };
  console.log(`[debug-${DEBUG_SESSION}] ${JSON.stringify(payload)}`);
  // #region agent log
  fetch(DEBUG_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Debug-Session-Id": DEBUG_SESSION,
    },
    body: JSON.stringify(payload),
  }).catch(() => {});
  // #endregion
}
