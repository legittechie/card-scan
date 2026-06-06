import { getCardScanApiUrl } from "../config";
import type { JobStatusResponse } from "../types/cardScan";

export const AUTH_REQUIRED_MESSAGE = "AUTH_REQUIRED";
export const API_SESSION_REJECTED_MESSAGE = "API_SESSION_REJECTED";

export function isAuthError(message: string | null | undefined): boolean {
  if (!message) return false;
  return (
    message === AUTH_REQUIRED_MESSAGE ||
    message === API_SESSION_REJECTED_MESSAGE ||
    message === "Not signed in" ||
    message.includes("401")
  );
}

/** Signed in locally, but scan API rejected the bearer token (usually wrong Supabase project on server). */
export function isApiSessionRejected(message: string | null | undefined): boolean {
  return message === API_SESSION_REJECTED_MESSAGE;
}

async function authHeaders(getAccessToken: () => Promise<string | null>): Promise<HeadersInit> {
  const token = await getAccessToken();
  if (!token) {
    throw new Error(AUTH_REQUIRED_MESSAGE);
  }
  return { Authorization: `Bearer ${token}` };
}

async function fetchWithAuthRetry(
  getAccessToken: () => Promise<string | null>,
  refreshSession: () => Promise<void>,
  buildRequest: (headers: HeadersInit) => Promise<Response>,
): Promise<Response> {
  let response = await buildRequest(await authHeaders(getAccessToken));
  if (response.status === 401) {
    await refreshSession();
    response = await buildRequest(await authHeaders(getAccessToken));
    if (response.status === 401) {
      const token = await getAccessToken();
      throw new Error(token ? API_SESSION_REJECTED_MESSAGE : AUTH_REQUIRED_MESSAGE);
    }
  }
  return response;
}

export async function uploadScan(
  uri: string,
  mimeType: string,
  fileName: string,
  getAccessToken: () => Promise<string | null>,
  refreshSession: () => Promise<void>,
): Promise<{ job_id: string }> {
  const base = getCardScanApiUrl();
  const form = new FormData();
  form.append("file", {
    uri,
    name: fileName,
    type: mimeType,
  } as unknown as Blob);

  const response = await fetchWithAuthRetry(getAccessToken, refreshSession, (headers) =>
    fetch(`${base}/scan`, {
      method: "POST",
      headers: headers as Record<string, string>,
      body: form,
    }),
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Upload failed (${response.status})`);
  }

  return response.json();
}

export async function fetchJobStatus(
  jobId: string,
  getAccessToken: () => Promise<string | null>,
  refreshSession: () => Promise<void>,
): Promise<JobStatusResponse> {
  const base = getCardScanApiUrl();
  const response = await fetchWithAuthRetry(getAccessToken, refreshSession, (headers) =>
    fetch(`${base}/status/${jobId}`, { headers: headers as Record<string, string> }),
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Status failed (${response.status})`);
  }

  return response.json();
}
