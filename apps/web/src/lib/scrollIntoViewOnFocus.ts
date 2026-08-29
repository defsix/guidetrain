/** How long to keep re-checking after a field gets focus, in ms. On-device
 * testing showed a small residual overlap even once the fix was otherwise
 * working — the keyboard's own open animation can still be running past
 * this window on a slower device, so the last correction fires against a
 * kb value that hasn't reached its final height yet. Generous on purpose:
 * a stray extra check once the field is already settled costs nothing. */
const WATCH_MS = 2500;
/** How often to re-check while watching. */
const CHECK_EVERY_MS = 150;
/** Breathing room above the keyboard (or the plain viewport edge, with no
 * keyboard involved) — flush against it reads as still covered. Padded a
 * bit past the bare minimum for the same reason WATCH_MS is generous: a
 * few extra px of margin absorbs the last bit of an animation still
 * settling, rather than needing the timing to land exactly right. */
const MARGIN_PX = 24;

/** Real px, read fresh every check — see the comment on --keyboard-height
 * in index.css for why this exists instead of trusting the viewport. */
function keyboardHeight(): number {
  const raw = getComputedStyle(document.documentElement).getPropertyValue("--keyboard-height");
  const n = parseFloat(raw);
  return Number.isFinite(n) ? n : 0;
}

/**
 * The nearest ancestor `scrollIntoView` would actually scroll to move `el` —
 * i.e. the first one styled to scroll its own overflow, same as every panel
 * in this app that holds a form (`.drills`, `.workout-panel`,
 * `.account-panel`, and the rest all set `overflow-y: auto` for exactly
 * this reason). Falls back to the page itself for a field that isn't
 * inside any of them.
 */
function nearestScrollContainer(el: HTMLElement): HTMLElement {
  let node = el.parentElement;
  while (node && node !== document.body) {
    const overflowY = getComputedStyle(node).overflowY;
    if (overflowY === "auto" || overflowY === "scroll") return node;
    node = node.parentElement;
  }
  return (document.scrollingElement as HTMLElement | null) ?? document.body;
}

/**
 * On a phone, the on-screen keyboard can end up covering a focused field —
 * and, for a field with a dropdown underneath it, the dropdown too.
 *
 * Earlier versions of this assumed the browser's own idea of the viewport
 * would shrink for the keyboard (it doesn't, on this WebView — see the
 * `--keyboard-height` comment in index.css for why that's measured
 * natively instead), and later assumed that once the field's real "is it
 * covered" state was known, setting `scroll-margin-bottom` and calling
 * `scrollIntoView` would take care of the rest. That part was still wrong,
 * in a way neither of those attempts could have shown: `scrollIntoView`,
 * `scroll-margin` included, can only scroll a container up to its own
 * `scrollHeight` — it can't manufacture room that doesn't exist in the DOM.
 * The field this kept getting reported on is the last thing in its list
 * (a muscle's exercise list, ending in the "add one yourself" form); once
 * that list is already scrolled as far as it goes, no margin, however
 * large, gets it any further. Every one of the last three fixes could have
 * been completely correct about the keyboard's height and still produced
 * exactly the "nothing happens" that kept getting reported.
 *
 * So this creates real scroll room instead of just asking for it: padding
 * the field's actual nearest scrolling ancestor by the keyboard's height,
 * for as long as the field stays focused, restored once it blurs. That
 * padding is what makes the last field in a list reachable at all — a
 * genuinely taller scrollable area to scroll within, not a hint applied to
 * an area that was already exhausted.
 *
 * Padding alone turned out not to be enough either, confirmed once
 * `--keyboard-height` itself was finally verified correct on a real
 * device: `scrollIntoView({ block: "nearest" })` only scrolls when it
 * decides the field isn't already within the container's own visible box —
 * and that box, container padding included, is still the field's full,
 * un-shrunk clientHeight. Nothing told it the bottom `kb` pixels of that
 * box are physically covered by the keyboard, so a field sitting anywhere
 * in that zone read as "already visible" and never got scrolled the rest
 * of the way — or scrolled by an unrelated amount, since padding changing
 * the container's scrollHeight mid-poll shifts what "nearest" resolves to
 * on the next check. `scroll-margin-bottom` on the field itself is what
 * actually tells `scrollIntoView` that zone doesn't count: set for just
 * the one call that needs it, so nothing else on the page is affected.
 * Padding creates the room to scroll into; margin is what makes
 * `scrollIntoView` actually use it instead of concluding there's nothing
 * to do.
 *
 * `extraVisible`, when given, is re-run on every check — not just once at
 * focus — and its element's own bottom edge is folded into the same
 * covered/margin math as the field's. It exists for AutocompleteInput: the
 * suggestions list below the field is `position: absolute`, so it doesn't
 * contribute to anything's layout size on its own, and it doesn't exist in
 * the DOM at focus time at all — it only mounts once there's a match to
 * show. A callback re-queried every tick is what lets this notice the
 * dropdown once it actually appears, rather than reasoning about a moment
 * that's already passed.
 */
export function scrollIntoViewOnFocus(
  e: React.FocusEvent<HTMLElement>,
  extraVisible?: () => HTMLElement | null,
) {
  const el = e.currentTarget;
  const container = nearestScrollContainer(el);
  const prevPadding = container.style.paddingBottom;
  const deadline = Date.now() + WATCH_MS;
  let restored = false;

  function restore() {
    if (restored) return;
    restored = true;
    container.style.paddingBottom = prevPadding;
    el.removeEventListener("blur", restore);
  }
  el.addEventListener("blur", restore, { once: true });

  function tick() {
    if (restored) return;

    const kb = keyboardHeight();
    container.style.paddingBottom = kb > 0 ? `${kb + MARGIN_PX}px` : prevPadding;

    const rect = el.getBoundingClientRect();
    const extraEl = extraVisible?.();
    const bottom = extraEl ? Math.max(rect.bottom, extraEl.getBoundingClientRect().bottom) : rect.bottom;
    const visibleHeight = (window.visualViewport?.height ?? window.innerHeight) - kb;
    if (rect.top < 0 || bottom > visibleHeight) {
      const prevMargin = el.style.scrollMarginBottom;
      // The margin only needs to cover however much of the extra element
      // sticks out past the field's own bottom edge, plus the keyboard.
      const overhang = Math.max(0, bottom - rect.bottom);
      el.style.scrollMarginBottom = `${kb + overhang + MARGIN_PX}px`;
      el.scrollIntoView({ block: "nearest", behavior: "smooth" });
      el.style.scrollMarginBottom = prevMargin;
    }

    if (Date.now() < deadline) {
      setTimeout(tick, CHECK_EVERY_MS);
    }
  }

  tick();
}
