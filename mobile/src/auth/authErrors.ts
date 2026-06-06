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
  otp_expired: "That code has expired. Request a new code and try again.",
  otp_disabled: "Email codes are not enabled for this project. Contact support.",
  unexpected_failure:
    "Supabase could not send the confirmation email. In Authentication → SMTP, set a valid Sender address (e.g. noreply@yourdomain.com or Name <noreply@yourdomain.com>) — mailer logs often show Invalid 'from' field. Then check Authentication → Logs.",
};

/** True when Supabase Auth mailer fails (HTTP 500 / confirmation email not sent). */
export function isEmailSendFailureError(err: unknown): boolean {
  const auth = asAuthError(err);
  if (!auth) return false;
  if (auth.status === 500) return true;
  const msg = auth.message?.toLowerCase() ?? "";
  return msg.includes("error sending confirmation email") || msg.includes("sending confirmation email");
}

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
  if (isEmailSendFailureError(err)) {
    return CODE_MESSAGES.unexpected_failure;
  }
  if (auth.code === "otp_expired") {
    return CODE_MESSAGES.otp_expired;
  }
  if (auth.code === "otp_disabled") {
    return CODE_MESSAGES.otp_disabled;
  }
  if (msg.includes("invalid otp") || msg.includes("token has expired")) {
    return CODE_MESSAGES.otp_expired;
  }
  if (auth.code === "unexpected_failure") {
    return CODE_MESSAGES.unexpected_failure;
  }

  return auth.message ?? "Something went wrong. Please try again.";
}
