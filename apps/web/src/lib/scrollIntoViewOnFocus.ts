/** How long to keep re-checking after a field gets focus, in ms. Generous —
 * a slow device's keyboard-open animation is the exact case this exists
 * for, and a stray extra check once the field is already visible costs
 * nothing. */
const WATCH_MS = 1500;
/** How often to re-check while watching. */
const CHECK_EVERY_MS = 150;

/**
 * On a phone, the on-screen keyboard can end up covering a focused field —
 * and, for a field with a dropdown underneath it, the dropdown too — before
 * the visible area has actually shrunk to make room for the keyboard.
 *
 * This used to wait for a single `visualViewport` `resize` event to settle
 * and then scroll once. That assumed the keyboard's own animation is the
 * only thing moving the field, and that `visualViewport.resize` is the
 * signal that fires when it does. Neither held up on the Android app: with
 * `windowSoftInputMode="adjustResize"` (see AndroidManifest.xml) it's the
 * WebView's own layout viewport that shrinks, on whatever schedule the
 * native window-resize animation runs on — not guaranteed to line up with
 * one clean `visualViewport` resize, or to be done resizing by any fixed
 * delay after it starts. A field could still end up under the keyboard with
 * nothing left listening to rescue it.
 *
 * So instead of waiting for a signal and trusting it once, this just checks
 * the field's actual position against the actual visible height —
 * `visualViewport.height` where it exists, `window.innerHeight` as the
 * fallback either way — repeatedly, for as long as a keyboard's open
 * animation could plausibly still be running. Whenever the field is still
 * (or newly) covered, it scrolls again. This doesn't need to know why the
 * viewport is changing shape or when it'll stop; it only needs to keep
 * asking "is the field visible yet?" until the answer is yes or time runs
 * out.
 */
export function scrollIntoViewOnFocus(e: React.FocusEvent<HTMLElement>) {
  const el = e.currentTarget;
  const deadline = Date.now() + WATCH_MS;

  function covered() {
    const rect = el.getBoundingClientRect();
    const visibleHeight = window.visualViewport?.height ?? window.innerHeight;
    return rect.top < 0 || rect.bottom > visibleHeight;
  }

  function tick() {
    if (covered()) {
      el.scrollIntoView({ block: "center", behavior: "smooth" });
    }
    if (Date.now() < deadline) {
      setTimeout(tick, CHECK_EVERY_MS);
    }
  }

  tick();
}
