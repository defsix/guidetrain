type Props = {
  /** Height in pixels. The mark is square; everything scales from this. */
  size?: number;
  /** Show the name beside the mark. Off in the header, where space is short. */
  withName?: boolean;
};

/**
 * The mark: three loaded bars, each shorter than the last.
 *
 * The same drawing as the favicon, rebuilt as a component rather than an
 * `<img>` so it can take the theme's ink and accent from CSS. A favicon is
 * rendered outside the page and has to hard-code its colours; this one should
 * not, or it would be the only thing on screen that ignores the theme.
 *
 * It draws the programme the app teaches. 5/3/1 ramps weight up and reps down,
 * and the last bar is the single the whole cycle was building to — so that is
 * the bar wearing the accent, and it is the same accent the muscle you picked
 * wears on the model.
 */
export default function Logo({ size = 28, withName = false }: Props) {
  return (
    <span className="logo" style={{ ["--logo-size" as string]: `${size}px` }}>
      <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden="true" focusable="false">
        <g className="logo-ink">
          <rect x="5" y="5.5" width="22" height="3.4" rx="1.7" />
          <rect x="3.4" y="3.6" width="2.6" height="7.2" rx="1.1" />
          <rect x="26" y="3.6" width="2.6" height="7.2" rx="1.1" />

          <rect x="8.5" y="14.3" width="15" height="3.4" rx="1.7" />
          <rect x="6.9" y="12.4" width="2.6" height="7.2" rx="1.1" />
          <rect x="22.5" y="12.4" width="2.6" height="7.2" rx="1.1" />
        </g>
        <g className="logo-accent">
          <rect x="12" y="23.1" width="8" height="3.4" rx="1.7" />
          <rect x="10.4" y="21.2" width="2.6" height="7.2" rx="1.1" />
          <rect x="19" y="21.2" width="2.6" height="7.2" rx="1.1" />
        </g>
      </svg>
      {/* The name is one word and set as one word — "Guide" in the body weight,
          "Train" in the accent, so the mark and the name say the same thing. */}
      {withName && (
        <span className="logo-name">
          Guide<b>Train</b>
        </span>
      )}
    </span>
  );
}
