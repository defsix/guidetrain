/** How long to keep re-checking after a field gets focus, in ms. Generous —
 * a slow device's keyboard-open animation is the exact case this exists
 * for, and a stray extra check once the field is already visible costs
 * nothing. */
const WATCH_MS = 1500;
/** How often to re-check while watching. */
const CHECK_EVERY_MS = 150;
/** Breathing room above the keyboard (or the plain viewport edge, with no
 * keyboard involved) — flush against it reads as still covered. */
const MARGIN_PX = 16;

/** Real px, read fresh every check — see the comment on --keyboard-height
 * in index.css for why this exists instead of trusting the viewport. */
function keyboardHeight(): number {
  const raw = getComputedStyle(document.documentElement).getPropertyValue("--keyboard-height");
  const n = parseFloat(raw);
  return Number.isFinite(n) ? n : 0;
}

/**
 * On a phone, the on-screen keyboard can end up covering a focused field —
 * and, for a field with a dropdown underneath it, the dropdown too.
 *
 * Two earlier versions of this both assumed the browser's own idea of the
 * viewport — `visualViewport.height` / `window.innerHeight` — shrinks once
 * the keyboard opens, and differed only in how long they waited for that to
 * settle before scrolling. Neither assumption held on the Android app: a
 * real device confirmed that on this WebView, once `enableEdgeToEdge` owns
 * window-inset handling, those numbers never change at all when the
 * keyboard opens, no matter what `windowSoftInputMode` says or what native
 * insets get consumed — `scrollIntoView`'s own `block: "center"`/`"nearest"`
 * math had nothing true to work from, waiting any amount of time was never
 * going to fix that, and neither would waiting for an event that was never
 * going to fire.
 *
 * So this stops inferring the covered area from the viewport at all. The
 * native Android shell measures the keyboard directly and hands it over as
 * `--keyboard-height` (see index.css) — 0 everywhere else, so this behaves
 * exactly as before on iOS/desktop/the plain website, where the viewport
 * genuinely does shrink and this number is simply always 0. Rather than
 * trying to compute "is this visible" by hand and call `scrollIntoView`
 * with a guessed target, it sets `scroll-margin-bottom` to the keyboard's
 * real height for the one call that needs it (then restores whatever was
 * there before, so nothing else on the page is affected) and lets the
 * browser's own scrolling machinery — which already correctly avoids a
 * `scroll-margin`, that part was never the problem — keep the field clear
 * of a zone it now actually knows is off-limits.
 *
 * Still polls rather than scrolling once: the keyboard's own open animation
 * still takes real, variable time, and the field's position on screen keeps
 * changing while it's mid-animation regardless of whether the viewport
 * itself ever moves.
 */
export function scrollIntoViewOnFocus(e: React.FocusEvent<HTMLElement>) {
  const el = e.currentTarget;
  const deadline = Date.now() + WATCH_MS;

  function tick() {
    const kb = keyboardHeight();
    const rect = el.getBoundingClientRect();
    const visibleHeight = (window.visualViewport?.height ?? window.innerHeight) - kb;
    const covered = rect.top < 0 || rect.bottom > visibleHeight;

    if (covered) {
      const prevMargin = el.style.scrollMarginBottom;
      el.style.scrollMarginBottom = `${kb + MARGIN_PX}px`;
      el.scrollIntoView({ block: "nearest", behavior: "smooth" });
      el.style.scrollMarginBottom = prevMargin;
    }

    if (Date.now() < deadline) {
      setTimeout(tick, CHECK_EVERY_MS);
    }
  }

  tick();
}
