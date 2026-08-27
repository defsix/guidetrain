import { useState } from "react";
import type { useAuth } from "../state/useAuth";
import type { SyncStatus } from "../state/useSync";
import { ENABLED_OAUTH_PROVIDERS } from "../lib/supabase";
import { clearAll } from "../lib/storage";
import { scrollIntoViewOnFocus } from "../lib/scrollIntoViewOnFocus";
import { useI18n } from "../i18n/I18nProvider";
import { useSwipeDismiss } from "../state/useSwipeDismiss";

/**
 * Google's own four-colour mark, not a reconstruction of someone else's brand
 * the way the app's own logo had to avoid Vite's. Google publishes this exact
 * path data for "Sign in with Google" buttons and wants it reused as-is.
 */
function GoogleMark() {
  return (
    <svg className="oauth-mark" viewBox="0 0 18 18" width="18" height="18" aria-hidden="true">
      <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z" />
      <path fill="#FBBC05" d="M3.964 10.71c-.18-.54-.282-1.117-.282-1.71s.102-1.17.282-1.71V4.958H.957C.347 6.173 0 7.548 0 9s.348 2.827.957 4.042l3.007-2.332z" />
      <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" />
    </svg>
  );
}

type Props = {
  open: boolean;
  onClose: () => void;
  auth: ReturnType<typeof useAuth>;
  sync: { status: SyncStatus; error: string | null };
};

/**
 * Sign in, sign up, or see where sync stands.
 *
 * Only reachable when a Supabase project is configured — `available` is false
 * with no `VITE_SUPABASE_URL` set, and the button that opens this is hidden in
 * that case rather than opening onto a form that cannot do anything. Training
 * without an account is not a reduced mode; it is the mode the app shipped in
 * for months.
 */
export default function AccountPanel({ open, onClose, auth, sync }: Props) {
  const { t } = useI18n();
  const [mode, setMode] = useState<"in" | "up" | "reset">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmSent, setConfirmSent] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [busy, setBusy] = useState(false);

  // The recovery form's own field — kept separate from `password` above so
  // switching in from a recovery link never shows a stray value left over
  // from an unrelated sign-in attempt on the same device.
  const [recoveryPassword, setRecoveryPassword] = useState("");
  const [recoveryDone, setRecoveryDone] = useState(false);

  // The two change-account forms, each with its own field and its own
  // "just saved" flag — the panel can only ever be showing one confirmation
  // per action, but the two actions are independent of each other.
  const [newPassword, setNewPassword] = useState("");
  const [passwordSaved, setPasswordSaved] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [emailChangeSent, setEmailChangeSent] = useState(false);

  // Two destructive actions, each its own two-step confirmation rather than
  // firing on the first click — everything else in this app that removes
  // something (a goal, an injury, a saved workout) is a single tap, because
  // each of those is trivial to redo. Neither of these is: one clears a
  // device, the other deletes an account outright, and a single-click
  // pattern that works for "remove a goal" is the wrong shape for either.
  const [confirmingLocal, setConfirmingLocal] = useState(false);
  const [confirmingAccount, setConfirmingAccount] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [localCleared, setLocalCleared] = useState(false);
  const swipe = useSwipeDismiss(onClose);

  if (!open) return null;

  function deleteLocalData() {
    clearAll();
    setConfirmingLocal(false);
    setLocalCleared(true);
  }

  async function deleteAccount() {
    setDeletingAccount(true);
    const ok = await auth.deleteAccount();
    if (ok) {
      // The account itself carried this device's own copy of everything —
      // an account that no longer exists is not somewhere sync can restore
      // it from, so this is the one case where clearing local data and
      // deleting the account are the same action rather than two.
      clearAll();
      onClose();
    }
    setDeletingAccount(false);
    setConfirmingAccount(false);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setConfirmSent(false);
    if (mode === "reset") {
      const ok = await auth.resetPassword(email);
      setBusy(false);
      if (ok) setResetSent(true);
      return;
    }
    const ok = mode === "in" ? await auth.signIn(email, password) : await auth.signUp(email, password);
    setBusy(false);
    if (ok) {
      setPassword("");
    } else if (auth.error === "confirm") {
      // Not a failure: the account exists, it just cannot be used yet. Saying
      // so is the difference between "check your email" and a form that looks
      // like it silently did nothing.
      setConfirmSent(true);
      auth.clearError();
    }
  }

  async function submitRecovery(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const ok = await auth.updatePassword(recoveryPassword);
    setBusy(false);
    if (ok) {
      setRecoveryPassword("");
      setRecoveryDone(true);
    }
  }

  async function submitNewPassword(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setPasswordSaved(false);
    const ok = await auth.updatePassword(newPassword);
    setBusy(false);
    if (ok) {
      setNewPassword("");
      setPasswordSaved(true);
    }
  }

  async function submitNewEmail(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setEmailChangeSent(false);
    const ok = await auth.updateEmail(newEmail);
    setBusy(false);
    if (ok) {
      setNewEmail("");
      setEmailChangeSent(true);
    }
  }

  return (
    <>
      <button className="workout-scrim" aria-label={t("account.close")} onClick={onClose} />
      <aside className="account-panel" aria-label={t("account.title")}>
        <div className={`workout-head ${swipe.dragging ? "dragging" : ""}`} {...swipe.handleProps}>
          <span className="sheet-handle" aria-hidden="true" />
          <h2>{t("account.title")}</h2>
          <button className="workout-close" onClick={onClose} aria-label={t("account.close")}>
            ✕
          </button>
        </div>

        {auth.recovery ? (
          <>
            {/* No tabs, no OAuth, no way out but finishing this — a recovery
                link exists for exactly one purpose, and the sign-in form it
                would otherwise sit beside asks for a password this session
                was opened specifically because the reader no longer has. */}
            <p className="plan-note">{t("account.recoveryIntro")}</p>
            {recoveryDone ? (
              <p className="plan-note">{t("account.recoveryDone")}</p>
            ) : (
              <form className="account-form" onSubmit={submitRecovery}>
                <label className="field">
                  <span>{t("account.newPassword")}</span>
                  <input
                    type="password"
                    value={recoveryPassword}
                    onChange={(e) => setRecoveryPassword(e.target.value)}
                    onFocus={scrollIntoViewOnFocus}
                    autoComplete="new-password"
                    minLength={6}
                    required
                  />
                </label>
                {auth.error && <p className="plan-note flag">{auth.error}</p>}
                <button className="primary-button" type="submit" disabled={busy}>
                  {t("account.setPassword")}
                </button>
              </form>
            )}
          </>
        ) : auth.session ? (
          <>
            <p className="account-email">{auth.session.user.email}</p>

            {/* One line, always present once signed in, so where things stand
                is never a question — "did that just save?" is exactly the
                worry an account exists to remove. */}
            <p className={`sync-status ${sync.status}`}>
              {sync.status === "merging" && t("account.merging")}
              {sync.status === "syncing" && t("account.syncing")}
              {sync.status === "synced" && t("account.synced")}
              {sync.status === "error" && t("account.syncError", { error: sync.error ?? "" })}
              {sync.status === "idle" && t("account.synced")}
            </p>

            <button className="account-signout" onClick={() => auth.signOut()}>
              {t("account.signOut")}
            </button>
            {/* Explicit, because it is not obvious and matters: signing out on
                a shared device must not delete the training that is sitting in
                this browser — it is already safe in the account either way. */}
            <p className="plan-note">{t("account.signOutNote")}</p>

            <section className="stats-section">
              <h3>{t("account.changePassword")}</h3>
              <form className="stats-edit" onSubmit={submitNewPassword}>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  onFocus={scrollIntoViewOnFocus}
                  autoComplete="new-password"
                  minLength={6}
                  placeholder={t("account.newPassword")}
                  aria-label={t("account.newPassword")}
                  required
                />
                <button type="submit" className="stats-save" disabled={busy}>
                  {t("account.save")}
                </button>
              </form>
              {passwordSaved && <p className="plan-note">{t("account.passwordSaved")}</p>}
            </section>

            <section className="stats-section">
              <h3>{t("account.changeEmail")}</h3>
              <form className="stats-edit" onSubmit={submitNewEmail}>
                <input
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  onFocus={scrollIntoViewOnFocus}
                  autoComplete="email"
                  placeholder={t("account.newEmail")}
                  aria-label={t("account.newEmail")}
                  required
                />
                <button type="submit" className="stats-save" disabled={busy}>
                  {t("account.save")}
                </button>
              </form>
              {emailChangeSent && <p className="plan-note">{t("account.emailChangeSent")}</p>}
            </section>

            <section className="stats-section account-danger">
              <h3>{t("account.deleteAccount")}</h3>
              {!confirmingAccount ? (
                <button
                  type="button"
                  className="account-delete"
                  onClick={() => setConfirmingAccount(true)}
                >
                  {t("account.deleteAccount")}
                </button>
              ) : (
                <>
                  <p className="plan-note flag">{t("account.deleteAccountWarning")}</p>
                  <div className="account-confirm-row">
                    <button
                      type="button"
                      className="account-delete"
                      onClick={deleteAccount}
                      disabled={deletingAccount}
                    >
                      {t("account.deleteAccountConfirm")}
                    </button>
                    <button
                      type="button"
                      className="tm-clear"
                      onClick={() => setConfirmingAccount(false)}
                      disabled={deletingAccount}
                    >
                      {t("account.cancel")}
                    </button>
                  </div>
                </>
              )}
            </section>
            {auth.error && <p className="plan-note flag">{auth.error}</p>}
          </>
        ) : mode === "reset" ? (
          <>
            <button
              type="button"
              className="plans-back"
              onClick={() => { setMode("in"); auth.clearError(); setResetSent(false); }}
            >
              ‹ {t("account.signIn")}
            </button>
            <form className="account-form" onSubmit={submit}>
              <label className="field">
                <span>{t("account.email")}</span>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onFocus={scrollIntoViewOnFocus}
                  autoComplete="email"
                  required
                />
              </label>
              {resetSent && <p className="plan-note">{t("account.resetSent")}</p>}
              {auth.error && <p className="plan-note flag">{auth.error}</p>}
              <button className="primary-button" type="submit" disabled={busy}>
                {t("account.sendReset")}
              </button>
            </form>
          </>
        ) : (
          <>
            {/* Above the email form, not inside either tab — it is the same
                action whether you'd otherwise have signed in or signed up,
                since a first OAuth sign-in from a provider creates the
                account. */}
            {ENABLED_OAUTH_PROVIDERS.map((provider) => (
              <button
                key={provider}
                className="oauth-button"
                onClick={() => auth.signInWithOAuth(provider)}
              >
                {provider === "google" && <GoogleMark />}
                {t(`account.continueWith.${provider}`)}
              </button>
            ))}
            {ENABLED_OAUTH_PROVIDERS.length > 0 && <p className="oauth-divider">{t("account.or")}</p>}

            <div className="hist-tabs">
              <button
                className={`program-tab ${mode === "in" ? "on" : ""}`}
                onClick={() => { setMode("in"); auth.clearError(); setConfirmSent(false); }}
              >
                {t("account.signIn")}
              </button>
              <button
                className={`program-tab ${mode === "up" ? "on" : ""}`}
                onClick={() => { setMode("up"); auth.clearError(); setConfirmSent(false); }}
              >
                {t("account.signUp")}
              </button>
            </div>

            <form className="account-form" onSubmit={submit}>
              <label className="field">
                <span>{t("account.email")}</span>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onFocus={scrollIntoViewOnFocus}
                  autoComplete="email"
                  required
                />
              </label>
              <label className="field">
                <span>{t("account.password")}</span>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onFocus={scrollIntoViewOnFocus}
                  autoComplete={mode === "in" ? "current-password" : "new-password"}
                  minLength={6}
                  required
                />
              </label>

              {mode === "in" && (
                <button
                  type="button"
                  className="tm-clear forgot-password"
                  onClick={() => { setMode("reset"); auth.clearError(); }}
                >
                  {t("account.forgotPassword")}
                </button>
              )}

              {confirmSent && <p className="plan-note">{t("account.confirmSent")}</p>}
              {auth.error && auth.error !== "confirm" && (
                <p className="plan-note flag">{auth.error}</p>
              )}

              <button className="primary-button" type="submit" disabled={busy}>
                {mode === "in" ? t("account.signIn") : t("account.signUp")}
              </button>
            </form>

            <p className="plan-note">{t("account.why")}</p>
          </>
        )}

        {/* Shared across every state above but recovery — clearing this
            device is a question worth asking whether or not there is
            anything to sign in to, and the recovery flow has exactly one
            job to finish before anything else belongs on screen. */}
        {!auth.recovery && (
          <section className="stats-section account-danger">
            <h3>{t("account.deleteLocalData")}</h3>
            {localCleared ? (
              <p className="plan-note">{t("account.deleteLocalDataDone")}</p>
            ) : !confirmingLocal ? (
              <button
                type="button"
                className="account-delete"
                onClick={() => setConfirmingLocal(true)}
              >
                {t("account.deleteLocalData")}
              </button>
            ) : (
              <>
                <p className="plan-note flag">
                  {t(auth.session ? "account.deleteLocalDataWarningSynced" : "account.deleteLocalDataWarning")}
                </p>
                <div className="account-confirm-row">
                  <button type="button" className="account-delete" onClick={deleteLocalData}>
                    {t("account.deleteLocalDataConfirm")}
                  </button>
                  <button
                    type="button"
                    className="tm-clear"
                    onClick={() => setConfirmingLocal(false)}
                  >
                    {t("account.cancel")}
                  </button>
                </div>
              </>
            )}
          </section>
        )}
      </aside>
    </>
  );
}
