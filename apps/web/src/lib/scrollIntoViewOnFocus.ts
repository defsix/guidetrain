/**
 * On a phone, the on-screen keyboard can end up covering a focused field —
 * and, for a field with a dropdown underneath it, the dropdown too — before
 * the visible area has actually shrunk to make room for the keyboard.
 * Scrolling on a blind fixed delay guessed at how long that resize takes,
 * which is exactly the kind of assumption a slower device or a longer
 * keyboard-open animation breaks — the field never gets rescued if the
 * resize is still in progress when the timer fires. `visualViewport`'s own
 * `resize` event fires as the real resize happens (Android's WebView
 * shell included, once `windowSoftInputMode="adjustResize"` is set — see
 * AndroidManifest.xml — actually shrinks the WebView itself), so this
 * waits for that to settle instead of guessing: it debounces `resize`
 * events until they stop for 120ms, then scrolls. A field that never gets a
 * resize event at all (nothing to make room for, or a `visualViewport`-less
 * browser) still gets the same fallback the old fixed delay always gave.
 */
export function scrollIntoViewOnFocus(e: React.FocusEvent<HTMLElement>) {
  const el = e.currentTarget;
  const vv = window.visualViewport;
  if (!vv) {
    setTimeout(() => el.scrollIntoView({ block: "center", behavior: "smooth" }), 300);
    return;
  }

  let done = false;
  let settle: ReturnType<typeof setTimeout>;
  const finish = () => {
    if (done) return;
    done = true;
    clearTimeout(settle);
    vv.removeEventListener("resize", onResize);
    el.scrollIntoView({ block: "center", behavior: "smooth" });
  };
  const onResize = () => {
    clearTimeout(settle);
    settle = setTimeout(finish, 120);
  };
  vv.addEventListener("resize", onResize);
  settle = setTimeout(finish, 300);
}
