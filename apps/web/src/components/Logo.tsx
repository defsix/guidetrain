type Props = {
  /** Height in pixels. The mark is square; everything scales from this. */
  size?: number;
  /** Show the name beside the mark. Off in the header, where space is short. */
  withName?: boolean;
};

/**
 * The mark: a bolt, drawn on the app's own grid.
 *
 * Not the one the Vite template ships with. That bolt is VoidZero's brand
 * asset — the MIT licence covers Vite's code rather than its logo, and its
 * guidelines rule out both recolouring it and using it to stand for another
 * product. Nobody owns the idea of a lightning bolt, so this is one of ours.
 *
 * The same drawing as the favicon, rebuilt as a component so it can take the
 * theme's accent from CSS rather than hard-coding it. A favicon renders outside
 * the page and has no choice; this one should not be the single element on
 * screen ignoring the theme.
 */
export default function Logo({ size = 28, withName = false }: Props) {
  return (
    <span className="logo" style={{ ["--logo-size" as string]: `${size}px` }}>
      <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden="true" focusable="false">
        <path
          className="logo-accent"
          d="M19.2 2.2 6.4 17.4a.9.9 0 0 0 .69 1.48h5.03l-1.3 10.02a.9.9 0 0 0 1.6.66l12.8-15.2a.9.9 0 0 0-.69-1.48h-5.03l1.3-10.02a.9.9 0 0 0-1.6-.66Z"
        />
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
