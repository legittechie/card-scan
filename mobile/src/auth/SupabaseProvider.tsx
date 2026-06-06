import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { getSupabaseConfig } from "../config";
import { confirmEmailFromUrl } from "./authCallback";

/** Bumped when auth client config changes — forces a new Supabase singleton. */
const AUTH_CLIENT_VERSION = 6;

export type SignUpOutcome =
  | { status: "session" }
  | { status: "confirm_otp" }
  | { status: "already_registered" };

type AuthContextValue = {
  supabase: SupabaseClient;
  session: Session | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<SignUpOutcome>;
  verifySignupOtp: (email: string, token: string, password: string) => Promise<{ hasSession: boolean }>;
  resendSignupOtp: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
  getAccessToken: () => Promise<string | null>;
  confirmEmailFromLink: (url: string) => Promise<{ ok: boolean; reason?: string }>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

let supabaseSingleton: SupabaseClient | null = null;
let supabaseClientVersion: number | null = null;

function getSupabase(): SupabaseClient {
  if (!supabaseSingleton || supabaseClientVersion !== AUTH_CLIENT_VERSION) {
    const { url, anonKey } = getSupabaseConfig();
    supabaseSingleton = createClient(url, anonKey, {
      auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    });
    supabaseClientVersion = AUTH_CLIENT_VERSION;
  }
  return supabaseSingleton;
}

export function SupabaseProvider({ children }: { children: React.ReactNode }) {
  const supabase = useMemo(() => getSupabase(), []);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  const syncSessionFromStorage = useCallback(async (): Promise<Session | null> => {
    const { data, error } = await supabase.auth.getSession();
    if (error) {
      setSession(null);
      return null;
    }

    setSession(data.session);
    return data.session;
  }, [supabase]);

  const confirmEmailFromLink = useCallback(
    async (url: string) => {
      return confirmEmailFromUrl(supabase, url);
    },
    [supabase],
  );

  useEffect(() => {
    void syncSessionFromStorage().finally(() => {
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
    });
    return () => sub.subscription.unsubscribe();
  }, [supabase, syncSessionFromStorage]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      const stored = await syncSessionFromStorage();
      if (!stored) {
        throw new Error("Signed in but session was not saved.");
      }
    },
    [supabase, syncSessionFromStorage],
  );

  const signUp = useCallback(
    async (email: string, password: string): Promise<SignUpOutcome> => {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
      });

      if (error) throw error;

      if (data.session && !data.user?.email_confirmed_at) {
        await supabase.auth.signOut({ scope: "local" });
        setSession(null);
      }

      if (data.session && data.user?.email_confirmed_at) {
        return { status: "session" };
      }

      if (!data.user && !data.session) {
        return { status: "confirm_otp" };
      }

      const identitiesCount = (data.user?.identities ?? []).length;
      if (identitiesCount === 0) {
        return { status: "already_registered" };
      }

      return { status: "confirm_otp" };
    },
    [supabase],
  );

  const verifySignupOtp = useCallback(
    async (email: string, token: string, password: string) => {
      const trimmedToken = token.trim();
      let verified = await supabase.auth.verifyOtp({
        email,
        token: trimmedToken,
        type: "signup",
      });

      if (verified.error) {
        verified = await supabase.auth.verifyOtp({
          email,
          token: trimmedToken,
          type: "email",
        });
      }

      if (verified.error) throw verified.error;

      if (verified.data.session) {
        setSession(verified.data.session);
        return { hasSession: true };
      }

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (signInError) throw signInError;

      const stored = await syncSessionFromStorage();
      return { hasSession: !!stored };
    },
    [supabase, syncSessionFromStorage],
  );

  const resendSignupOtp = useCallback(
    async (email: string) => {
      const { error } = await supabase.auth.resend({
        type: "signup",
        email,
      });
      if (error) throw error;
    },
    [supabase],
  );

  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    setSession(null);
  }, [supabase]);

  const getAccessToken = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  }, [supabase]);

  const value = useMemo(
    () => ({
      supabase,
      session,
      loading,
      signIn,
      signUp,
      verifySignupOtp,
      resendSignupOtp,
      signOut,
      getAccessToken,
      confirmEmailFromLink,
    }),
    [
      supabase,
      session,
      loading,
      signIn,
      signUp,
      verifySignupOtp,
      resendSignupOtp,
      signOut,
      getAccessToken,
      confirmEmailFromLink,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within SupabaseProvider");
  return ctx;
}
