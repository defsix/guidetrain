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
 */
export function scrollIntoViewOnFocus(e: React.FocusEvent<HTMLElement>) {
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
    const visibleHeight = (window.visualViewport?.height ?? window.innerHeight) - kb;
    if (rect.top < 0 || rect.bottom > visibleHeight) {
      el.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }

    if (Date.now() < deadline) {
      setTimeout(tick, CHECK_EVERY_MS);
    }
  }

  tick();
}
