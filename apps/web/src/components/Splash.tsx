type Props = {
  /** Whether the fade-out has started. */
  fading: boolean;
};

/**
 * The mark, full window, before the form — shown once, and only to someone
 * `Onboarding` has already confirmed is actually new.
 *
 * The name sits in a pill directly over the middle of the bolt rather than
 * being set beside it the way the header wordmark is: at this size the two
 * read as one lockup, and the pill keeps "Train" legible over the bolt's
 * fill regardless of which theme is active. Same path data as `Logo`, not
 * duplicated by copy-paste — see that component for why it's drawn rather
 * than borrowed.
 */
export default function Splash({ fading }: Props) {
  return (
    <div className={`splash ${fading ? "splash-fade" : ""}`} aria-hidden="true">
      <span className="splash-mark">
        <svg viewBox="0 0 32 32" focusable="false">
          <path
            className="splash-bolt"
            d="M19.2 2.2 6.4 17.4a.9.9 0 0 0 .69 1.48h5.03l-1.3 10.02a.9.9 0 0 0 1.6.66l12.8-15.2a.9.9 0 0 0-.69-1.48h-5.03l1.3-10.02a.9.9 0 0 0-1.6-.66Z"
          />
        </svg>
        <span className="splash-name">
          Guide<b>Train</b>
        </span>
      </span>
    </div>
  );
}
