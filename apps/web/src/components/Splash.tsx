import { useT } from "../i18n/I18nProvider";

type Props = {
  /** Whether the fade-out has started. */
  fading: boolean;
  /**
   * The brief, bar-less version shown to someone `Onboarding` already knows
   * — a saved profile or an active session. There's nothing actually
   * loading for them, so the progress bar (which implies there is) is
   * dropped, and the hold/fade are both cut down in `Onboarding`'s timers
   * to match — a flash of the mark on the way past, not a wait.
   */
  quick?: boolean;
};

/**
 * The mark, full window, before the form — shown once per visit. New
 * visitors get the full version with its loading bar; everyone else gets
 * the quick one, see `quick` above.
 *
 * Same path data as `Logo`, not duplicated by copy-paste — see that
 * component for why it's drawn rather than borrowed. Sized up rather than
 * redrawn: the shape is exactly the header's, just scaled to stand next to
 * type this large.
 */
export default function Splash({ fading, quick = false }: Props) {
  const t = useT();
  return (
    <div
      className={`splash ${quick ? "splash-quick" : ""} ${fading ? "splash-fade" : ""}`}
      aria-hidden="true"
    >
      <div className="splash-row">
        <svg viewBox="0 0 32 32" focusable="false">
          <path
            className="splash-bolt"
            d="M19.2 2.2 6.4 17.4a.9.9 0 0 0 .69 1.48h5.03l-1.3 10.02a.9.9 0 0 0 1.6.66l12.8-15.2a.9.9 0 0 0-.69-1.48h-5.03l1.3-10.02a.9.9 0 0 0-1.6-.66Z"
          />
        </svg>
        <div className="splash-text">
          <span className="splash-name">
            Guide<b>Train</b>
          </span>
          <span className="splash-tagline">{t("splash.tagline")}</span>
        </div>
      </div>
      {!quick && (
        <div className="splash-bar">
          <span className="splash-bar-fill" />
        </div>
      )}
    </div>
  );
}
