import { AuthError } from "@supabase/supabase-js";

type AuthErrorLike = {
  message?: string;
  status?: number;
  code?: string;
};

function asAuthError(err: unknown): AuthErrorLike | null {
  if (err instanceof AuthError) {
    return { message: err.message, status: err.status, code: err.code };
  }
  if (err && typeof err === "object") {
    const o = err as Record<string, unknown>;
    return {
      message: typeof o.message === "string" ? o.message : undefined,
      status: typeof o.status === "number" ? o.status : undefined,
      code: typeof o.code === "string" ? o.code : undefined,
    };
  }
  if (err instanceof Error) {
    return { message: err.message };
  }
  return null;
}

/** True when Supabase throttles signup / resend confirmation emails. */
export function isEmailRateLimitError(err: unknown): boolean {
  const auth = asAuthError(err);
  if (!auth) return false;
  if (auth.status === 429) return true;
  const code = auth.code?.toLowerCase() ?? "";
  return code.includes("rate_limit") || code.includes("over_email");
}

const CODE_MESSAGES: Record<string, string> = {
  invalid_credentials: "Incorrect email or password.",
  email_not_confirmed:
    "Confirm your email before signing in. Check your inbox or resend the confirmation link from sign up.",
  user_already_registered: "This email is already registered. Try signing in instead.",
  weak_password: "Choose a stronger password (at least 6 characters).",
  over_email_send_rate_limit:
    "Too many emails sent. Wait a minute and try again, or sign in if you already confirmed your account.",
  signup_disabled: "Sign up is not available right now. Contact support if this continues.",
};

export function getAuthErrorMessage(err: unknown): string {
  const auth = asAuthError(err);
  if (!auth) {
    return err instanceof Error ? err.message : "Something went wrong. Please try again.";
  }

  if (auth.code && CODE_MESSAGES[auth.code]) {
    return CODE_MESSAGES[auth.code];
  }

  const msg = auth.message?.toLowerCase() ?? "";
  if (msg.includes("invalid login credentials")) {
    return CODE_MESSAGES.invalid_credentials;
  }
  if (msg.includes("email not confirmed")) {
    return CODE_MESSAGES.email_not_confirmed;
  }
  if (isEmailRateLimitError(err)) {
    return CODE_MESSAGES.over_email_send_rate_limit;
  }

  return auth.message ?? "Something went wrong. Please try again.";
}
