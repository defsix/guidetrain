import { useState } from "react";
import type { useAuth } from "../state/useAuth";
import type { SyncStatus } from "../state/useSync";
import { useI18n } from "../i18n/I18nProvider";

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
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmSent, setConfirmSent] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!open) return null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setConfirmSent(false);
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

  return (
    <>
      <button className="workout-scrim" aria-label={t("account.close")} onClick={onClose} />
      <aside className="account-panel" aria-label={t("account.title")}>
        <div className="workout-head">
          <h2>{t("account.title")}</h2>
          <button className="workout-close" onClick={onClose} aria-label={t("account.close")}>
            ✕
          </button>
        </div>

        {auth.session ? (
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
          </>
        ) : (
          <>
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
                  autoComplete={mode === "in" ? "current-password" : "new-password"}
                  minLength={6}
                  required
                />
              </label>

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
      </aside>
    </>
  );
}
