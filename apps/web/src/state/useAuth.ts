import { useCallback, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase, hasBackend } from "../lib/supabase";
import {
  isNativeAuthBridgeAvailable,
  NATIVE_OAUTH_REDIRECT,
  startNativeOAuth,
} from "../lib/nativeAuthBridge";

export type AuthState = {
  /** Null while checking, then a session or null for signed out. */
  session: Session | null;
  /** True until the stored session has been read; avoids a sign-in flash. */
  loading: boolean;
  /** The last failure, in the reader's terms rather than the API's. */
  error: string | null;
  available: boolean;
  userId: string | null;
  /**
   * A password-reset link was just followed. Supabase's own recovery flow
   * signs the browser in — the link carries a real session — which is
   * exactly what makes this flag necessary: without it, the app's own
   * redirect-once-signed-in effects would read that session as an ordinary
   * sign-in and send the reader straight to the explorer, past the one
   * screen the whole link existed to reach.
   */
  recovery: boolean;
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
  const [recovery, setRecovery] = useState(false);

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
    // being the one that asked. PASSWORD_RECOVERY is Supabase's own event for
    // exactly one moment: a recovery link was just followed. It fires once,
    // alongside the session it also signs in, so it has to be caught right
    // here rather than inferred later from anything about the session itself
    // — a recovered session looks identical to an ordinary one once this
    // event has passed.
    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      if (!alive) return;
      if (event === "PASSWORD_RECOVERY") setRecovery(true);
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
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      // Without this, the confirmation email links to the project's Site
      // URL — a Supabase-dashboard setting that defaults to
      // http://localhost:3000 and has to be changed by hand. Setting it here
      // means the link is correct regardless of what that dashboard field
      // says. The target is the bare origin, not "#/explore" directly: the
      // confirmation link carries a PKCE `code` as a real query parameter,
      // and landing on "/" lets onboarding's own redirect-once-signed-in
      // effect send it on to the explorer, rather than this guessing at how
      // Supabase combines a query string with a URL that already has a hash.
      options: { emailRedirectTo: window.location.origin },
    });
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
    setRecovery(false);
  }, []);

  /**
   * Sends the "reset your password" email. Deliberately reports success even
   * when the address has no account — Supabase itself stays quiet either way
   * (see its own docs on this), and a form that answered honestly would tell
   * anyone who typed an email address whether it was registered.
   */
  const resetPassword = useCallback(async (email: string) => {
    if (!supabase) return false;
    setError(null);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      // Same reasoning as emailRedirectTo on signUp: the bare origin, not
      // "#/explore" — Onboarding.tsx's own redirect effect is what gets a
      // signed-in reader the rest of the way there, once recovery is no
      // longer in the way of it.
      redirectTo: window.location.origin,
    });
    if (error) {
      setError(error.message);
      return false;
    }
    return true;
  }, []);

  /** Sets a new password — the recovery flow's landing action, and also
   *  reachable from the account panel by anyone already signed in. */
  const updatePassword = useCallback(async (password: string) => {
    if (!supabase) return false;
    setError(null);
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setError(error.message);
      return false;
    }
    setRecovery(false);
    return true;
  }, []);

  /**
   * Starts an email change. The new address gets a confirmation link before
   * anything actually changes — Supabase's "secure email change" setting
   * (on by default) sends one to the old address too, so a stolen session
   * alone cannot quietly redirect an account's mail.
   */
  const updateEmail = useCallback(async (email: string) => {
    if (!supabase) return false;
    setError(null);
    const { error } = await supabase.auth.updateUser(
      { email },
      { emailRedirectTo: window.location.origin },
    );
    if (error) {
      setError(error.message);
      return false;
    }
    return true;
  }, []);

  /**
   * Hands off to a third-party provider. There is no session to return here —
   * a successful call ends with the browser already navigating to the
   * provider's consent screen, not with anything this function could report.
   * Only a failure to even start the redirect surfaces, as an error.
   *
   * Sent back to `#/explore` regardless of where the account panel was opened
   * from — onboarding included, now that a returning user can sign in before
   * ever filling in a profile. Landing there while the merge is still in
   * flight is fine: `BodyExplorer` mounts its own `useAuth`/`useSync` pair,
   * sees the already-persisted session, and runs the same merge again —
   * `mergeOnSignIn` is safe to repeat.
   *
   * Inside the native Android/iOS shells (see nativeAuthBridge.ts), Google
   * won't show its consent screen in the embedded WebView at all — so there
   * `skipBrowserRedirect` stops Supabase from navigating this page, and the
   * returned authorize URL is handed to native code instead (Custom Tabs on
   * Android, `ASWebAuthenticationSession` on iOS), which reloads this same
   * page once the provider redirects back to the app's own custom scheme.
   */
  const signInWithOAuth = useCallback(async (provider: "google" | "apple" | "facebook") => {
    if (!supabase) return;
    setError(null);
    const native = isNativeAuthBridgeAvailable();
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options: native
        ? { redirectTo: NATIVE_OAUTH_REDIRECT, skipBrowserRedirect: true }
        : { redirectTo: `${window.location.origin}/#/explore` },
    });
    if (error) {
      setError(error.message);
      return;
    }
    if (native && data?.url) startNativeOAuth(data.url);
  }, []);

  /**
   * Deletes the account, not just its data. `delete_own_account()`
   * (`supabase/migrations/0005_delete_account.sql`) removes the row in
   * `auth.users`; every table a user owns references it `on delete cascade`,
   * so the profile, log, programmes, training maxes, known maxes and
   * body-weight history all go with it in one statement. Signs out
   * afterwards on principle — the session Supabase issued is for an account
   * that, by the time this returns, no longer exists — though the row being
   * gone already makes it unusable regardless. Clearing this device's own
   * local copy is the caller's job (see `clearAll` in `lib/storage.ts`):
   * this function only knows about the account.
   */
  const deleteAccount = useCallback(async () => {
    if (!supabase) return false;
    setError(null);
    const { error } = await supabase.rpc("delete_own_account");
    if (error) {
      setError(error.message);
      return false;
    }
    await supabase.auth.signOut();
    return true;
  }, []);

  const clearError = useCallback(() => setError(null), []);

  return {
    session,
    loading,
    error,
    clearError,
    available: hasBackend,
    userId: session?.user.id ?? null,
    recovery,
    signIn,
    signUp,
    signOut,
    signInWithOAuth,
    resetPassword,
    updatePassword,
    updateEmail,
    deleteAccount,
  };
}
