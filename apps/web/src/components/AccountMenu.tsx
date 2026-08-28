import { useI18n } from "../i18n/I18nProvider";
import { useSwipeDismiss } from "../state/useSwipeDismiss";

type Props = {
  open: boolean;
  onClose: () => void;
  /** Nothing logged yet is not a broken History — it's excluded the same
      way the old toolbar pill was, rather than opening onto an empty list. */
  hasHistory: boolean;
  /** Progress needs a profile to have anything to show, same as the old
      toolbar pill's own gating. */
  hasProfile: boolean;
  /** Hidden entirely with no Supabase project configured — same as the old
      logo-click behaviour, just decided here instead of at the call site. */
  accountAvailable: boolean;
  signedIn: boolean;
  onOpenHistory: () => void;
  onOpenStats: () => void;
  onOpenAccount: () => void;
};

/**
 * Where the logo in the header now leads: one place for everything that
 * isn't training itself — History, Progress, and account access. These used
 * to be three separate pills (Equipment stayed put; it's about what's
 * physically on hand right now, not the reader's own data). Grouping them
 * behind one entry point keeps the header down to a single line without
 * three more items competing for room in the canvas toolbar's scrolling
 * strip.
 */
export default function AccountMenu({
  open,
  onClose,
  hasHistory,
  hasProfile,
  accountAvailable,
  signedIn,
  onOpenHistory,
  onOpenStats,
  onOpenAccount,
}: Props) {
  const { t } = useI18n();
  const swipe = useSwipeDismiss(onClose);
  if (!open) return null;

  function go(action: () => void) {
    onClose();
    action();
  }

  return (
    <>
      <button className="workout-scrim" aria-label={t("menu.close")} onClick={onClose} />
      <aside className="account-menu" aria-label={t("menu.title")}>
        <div className={`workout-head ${swipe.dragging ? "dragging" : ""}`} {...swipe.handleProps}>
          <span className="sheet-handle" aria-hidden="true" />
          <h2>{t("menu.title")}</h2>
          <button className="workout-close" onClick={onClose} aria-label={t("menu.close")}>
            ✕
          </button>
        </div>

        <ul className="account-menu-list">
          {hasHistory && (
            <li>
              <button className="account-menu-item" onClick={() => go(onOpenHistory)}>
                {t("history.title")}
              </button>
            </li>
          )}
          {hasProfile && (
            <li>
              <button className="account-menu-item" onClick={() => go(onOpenStats)}>
                {t("stats.title")}
              </button>
            </li>
          )}
          {accountAvailable && (
            <li>
              <button
                className={`account-menu-item ${signedIn ? "signed-in" : ""}`}
                onClick={() => go(onOpenAccount)}
              >
                {t("account.title")}
              </button>
            </li>
          )}
        </ul>
      </aside>
    </>
  );
}
