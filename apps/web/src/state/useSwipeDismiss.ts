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
 * content of its own, so there's nothing to disambiguate there.
 *
 * Committed on release rather than a live, finger-following drag: past the
 * threshold at touchend closes the panel outright, matching how every other
 * way of closing one already works here — instant, no slide-out animation
 * to keep in sync with a dozen different panel widths and breakpoints.
 * `dragging` is exposed only so the header can show a light, immediate cue
 * that the gesture registered before the release decides anything.
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
    setDragging(dy > 12 && dy > Math.abs(dx));
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
      if (dy > THRESHOLD_PX && dy > Math.abs(dx)) onClose();
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
