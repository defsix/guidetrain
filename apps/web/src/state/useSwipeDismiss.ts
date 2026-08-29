import { useCallback, useRef, useState } from "react";
import type { TouchEvent } from "react";

const THRESHOLD_PX = 70;

/**
 * Drag a panel's header down to close it — the gesture every one of these
 * sheets is missing today, next to the existing tap-the-✕ and
 * tap-the-scrim ways to dismiss one.
 *
 * Scoped to the header specifically, not the whole sheet: most of these
 * panels hold a scrollable list (History, the plan library, both new
 * exercise libraries), and a swipe started over that list needs to scroll
 * it, not close the sheet out from under it. The header has no scrollable
 * content of its own, so there's nothing to disambiguate there — and with
 * `touch-action: none` on it (see the matching comment in App.css/
 * anatomy.css), there's no competing native gesture there either.
 *
 * Committed on release rather than a live, finger-following drag: past the
 * threshold at touchend closes the panel outright, matching how every other
 * way of closing one already works here — instant, no slide-out animation
 * to keep in sync with a dozen different panel widths and breakpoints.
 * `dragging` is exposed only so the header can show a light, immediate cue
 * that the gesture registered before the release decides anything.
 *
 * "Is this actually a downward swipe" originally required `dy > |dx|` — a
 * straight 45° cone off vertical. That's exactly right for a synthetic
 * test event, which moves in a perfectly straight line because nothing
 * about it decays; it's the wrong shape for an actual thumb, which
 * routinely drifts sideways over the course of a real swipe, especially at
 * the moment of lift-off `touchend` measures. `touch-action: none` already
 * means there's no native horizontal-scroll gesture left in this region to
 * disambiguate against, so the tight ratio was only ever making a real
 * gesture harder to land, not protecting against anything a real header
 * still competes with. `dy > |dx| / 2` — up to about 63° off vertical —
 * keeps out a clearly sideways drag while giving an imprecise real swipe
 * the room a real finger needs.
 */
export function useSwipeDismiss(onClose: () => void) {
  const start = useRef<{ x: number; y: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  const onTouchStart = useCallback((e: TouchEvent) => {
    const t = e.touches[0];
    start.current = { x: t.clientX, y: t.clientY };
  }, []);

  const onTouchMove = useCallback((e: TouchEvent) => {
    if (!start.current) return;
    const t = e.touches[0];
    const dy = t.clientY - start.current.y;
    const dx = t.clientX - start.current.x;
    setDragging(dy > 12 && dy > Math.abs(dx) / 2);
  }, []);

  const reset = useCallback(() => {
    start.current = null;
    setDragging(false);
  }, []);

  const onTouchEnd = useCallback(
    (e: TouchEvent) => {
      if (!start.current) return;
      const t = e.changedTouches[0];
      const dy = t.clientY - start.current.y;
      const dx = t.clientX - start.current.x;
      reset();
      if (dy > THRESHOLD_PX && dy > Math.abs(dx) / 2) onClose();
    },
    [onClose, reset],
  );

  return {
    dragging,
    handleProps: {
      onTouchStart,
      onTouchMove,
      onTouchEnd,
      onTouchCancel: reset,
    },
  };
}
