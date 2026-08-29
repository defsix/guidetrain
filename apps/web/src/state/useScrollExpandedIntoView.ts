import { useEffect, useRef } from "react";

/**
 * Tapping a row open in an accordion-style list (a stretch, a calisthenics
 * move, an exercise's own drill-down) can reveal content — instructions,
 * a video link — that extends below the fold, with nothing to bring it
 * back into view. Unlike `scrollIntoViewOnFocus.ts`, no keyboard is ever
 * involved here (a tap doesn't open one), so none of that file's
 * keyboard-avoidance machinery applies — this only needs the plain
 * `scrollIntoView` half of the same idea, run once the newly-opened
 * content has actually rendered.
 *
 * `register(id)` returns a stable ref callback for a given row's own
 * expandable element — stable per id, so passing it as a JSX `ref` doesn't
 * churn on every render the way a fresh closure would. Call it with the
 * same id a row's own "is this the open one" check already uses.
 */
export function useScrollExpandedIntoView(expandedId: string | null) {
  const elements = useRef(new Map<string, HTMLElement>());
  const callbacks = useRef(new Map<string, (el: HTMLElement | null) => void>());

  useEffect(() => {
    if (!expandedId) return;
    const el = elements.current.get(expandedId);
    if (!el) return;
    // One frame so the newly-opened content has actually laid out —
    // scrollIntoView measures whatever's there right now, and right after
    // the state update that opened it, that's still the old, closed size.
    const raf = requestAnimationFrame(() => {
      el.scrollIntoView({ block: "nearest", behavior: "smooth" });
    });
    return () => cancelAnimationFrame(raf);
  }, [expandedId]);

  return function register(id: string) {
    let cb = callbacks.current.get(id);
    if (!cb) {
      cb = (el: HTMLElement | null) => {
        if (el) elements.current.set(id, el);
        else elements.current.delete(id);
      };
      callbacks.current.set(id, cb);
    }
    return cb;
  };
}
