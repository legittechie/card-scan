import * as QueryParams from "expo-auth-session/build/QueryParams";
import { makeRedirectUri } from "expo-auth-session";
import Constants, { ExecutionEnvironment } from "expo-constants";

/** Deep link Supabase must allow in Authentication → URL configuration. */
export function getEmailAuthRedirectUri(): string {
  const inExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

  // Expo Go must use exp:// (current Metro host). Forcing cardscan:// yields invalid URLs
  // like cardscan:///--/auth/callback and can break signup confirmation emails.
  if (inExpoGo) {
    return makeRedirectUri({ path: "auth/callback" });
  }

  return makeRedirectUri({
    scheme: "cardscan",
    path: "auth/callback",
    native: "cardscan://auth/callback",
  });
}

type SupabaseAuthClient = {
  auth: {
    setSession: (tokens: {
      access_token: string;
      refresh_token: string;
    }) => Promise<{ data: { session: unknown }; error: Error | null }>;
    exchangeCodeForSession: (code: string) => Promise<{
      data: { session: unknown };
      error: Error | null;
    }>;
    verifyOtp: (params: {
      token_hash: string;
      type: "email" | "signup" | "recovery" | "invite" | "magiclink" | "email_change";
    }) => Promise<{ data: { session: unknown }; error: Error | null }>;
    signOut: () => Promise<{ error: Error | null }>;
  };
};

/** Parse confirmation / magic-link URL and persist session (mobile deep link). */
export async function createSessionFromUrl(
  supabase: SupabaseAuthClient,
  url: string,
): Promise<{ ok: boolean; reason?: string }> {
  const { params, errorCode } = QueryParams.getQueryParams(url);
  if (errorCode) {
    return { ok: false, reason: errorCode };
  }

  if (params.token_hash && params.type) {
    const otpType = params.type === "signup" ? "email" : params.type;
    const { data, error } = await supabase.auth.verifyOtp({
      token_hash: params.token_hash,
      type: otpType as "email",
    });
    if (error) {
      return { ok: false, reason: error.message };
    }
    return { ok: !!data.session };
  }

  if (params.code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(params.code);
    if (error) {
      return { ok: false, reason: error.message };
    }
    return { ok: !!data.session };
  }

  const accessToken = params.access_token;
  const refreshToken = params.refresh_token;
  if (!accessToken) {
    return { ok: false, reason: "missing_tokens" };
  }

  const { data, error } = await supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken ?? "",
  });
  if (error) {
    return { ok: false, reason: error.message };
  }
  return { ok: !!data.session };
}

/**
 * Completes signup email confirmation from a deep link and keeps the verified session.
 */
export async function confirmEmailFromUrl(
  supabase: SupabaseAuthClient,
  url: string,
): Promise<{ ok: boolean; reason?: string }> {
  const verified = await createSessionFromUrl(supabase, url);
  if (!verified.ok) {
    return verified;
  }

  return { ok: true };
}
