import { useCallback, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase, hasBackend } from "../lib/supabase";

export type AuthState = {
  /** Null while checking, then a session or null for signed out. */
  session: Session | null;
  /** True until the stored session has been read; avoids a sign-in flash. */
  loading: boolean;
  /** The last failure, in the reader's terms rather than the API's. */
  error: string | null;
  available: boolean;
  userId: string | null;
};

/**
 * Signed in, or not.
 *
 * Signing out deliberately does not clear local data. The two are different
 * things: an account is where your training is *kept*, and the device is where
 * it is *used*. Wiping a shared laptop's local copy because somebody signed out
 * would delete training that person still has every right to — and the same
 * data is already safe in their account, so there is nothing to protect by
 * destroying it here.
 */
export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(hasBackend);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) return;
    let alive = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!alive) return;
      setSession(data.session);
      setLoading(false);
    });

    // Covers refreshes, sign-outs in another tab, and the redirect back from a
    // confirmation link — all of which change the session without this hook
    // being the one that asked.
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      if (!alive) return;
      setSession(next);
      setLoading(false);
    });

    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    if (!supabase) return false;
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError(error.message);
      return false;
    }
    return true;
  }, []);

  const signUp = useCallback(async (email: string, password: string) => {
    if (!supabase) return false;
    setError(null);
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) {
      setError(error.message);
      return false;
    }
    // With email confirmation on, sign-up returns a user and no session: the
    // account exists but is not usable until the link is clicked. Saying so is
    // the difference between "check your email" and an app that looks broken.
    if (!data.session) {
      setError("confirm");
      return false;
    }
    return true;
  }, []);

  const signOut = useCallback(async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
  }, []);

  /**
   * Hands off to a third-party provider. There is no session to return here —
   * a successful call ends with the browser already navigating to the
   * provider's consent screen, not with anything this function could report.
   * Only a failure to even start the redirect surfaces, as an error.
   *
   * Sent back to `#/explore`, the only place this is ever called from — the
   * account panel does not exist anywhere the app would not already show that
   * route once signed in.
   */
  const signInWithOAuth = useCallback(async (provider: "google" | "apple" | "facebook") => {
    if (!supabase) return;
    setError(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}/#/explore` },
    });
    if (error) setError(error.message);
  }, []);

  const clearError = useCallback(() => setError(null), []);

  return {
    session,
    loading,
    error,
    clearError,
    available: hasBackend,
    userId: session?.user.id ?? null,
    signIn,
    signUp,
    signOut,
    signInWithOAuth,
  };
}
