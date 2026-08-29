import { useEffect, useState } from "react";

/**
 * TEMPORARY — remove once the Android keyboard-inset chain is confirmed
 * working, or once this has told us where it actually breaks.
 *
 * v1.24's on-device report confirmed --keyboard-height stuck at 0px with
 * the keyboard visibly open, ruling out "wrong measurement technique" as
 * the explanation for the last several fixes — the native side has never
 * actually been producing a real number, through either of the two
 * completely different techniques tried so far. What's still unknown is
 * *why*: whether the global layout listener in MainActivity.kt is firing
 * at all once the keyboard is up, and if it is, what raw numbers it's
 * seeing that land on a gap of 0.
 *
 * So this now also shows those raw inputs, not just the number they
 * produce: --debug-layout-passes (does this count keep climbing while the
 * keyboard's open, or is the listener not firing at all), --debug-root-h
 * and --debug-frame-bottom (rootView.height and getWindowVisibleDisplayFrame's
 * own bottom — if these stay equal to each other with the keyboard up,
 * the listener is firing but the OS isn't reporting any occlusion; if
 * --debug-layout-passes itself never changes, the listener isn't firing at
 * all). Whichever of those is true says exactly what to fix next, instead
 * of guessing a third native technique blind.
 *
 * Pinned to the TOP of the screen, not the bottom — the first report using
 * this badge confirmed why bottom doesn't work: a `position: fixed;
 * bottom: 0` element sits at the bottom of the WebView's own content area,
 * which is exactly what never shrinks for the keyboard (that's the whole
 * bug). So the badge was getting covered by the keyboard at precisely the
 * one moment it's needed — the keyboard only ever covers the bottom of the
 * screen, so pinning this to the top instead is what keeps it visible
 * regardless of keyboard state.
 */
export default function KeyboardDebugBadge() {
  const [lines, setLines] = useState<string[]>([]);

  useEffect(() => {
    const read = (prop: string) =>
      getComputedStyle(document.documentElement).getPropertyValue(prop).trim() || "(empty)";

    const tick = () => {
      const vv = window.visualViewport ? `${Math.round(window.visualViewport.height)}px` : "n/a";
      setLines([
        `kb=${read("--keyboard-height")} inner=${window.innerHeight}px vv=${vv}`,
        `passes=${read("--debug-layout-passes")} rootH=${read("--debug-root-h")} frameBottom=${read("--debug-frame-bottom")}`,
      ]);
    };
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, []);

  return (
    <div
      style={{
        position: "fixed",
        top: "calc(var(--safe-area-top, 0px) + 4px)",
        left: 8,
        zIndex: 999999,
        background: "rgba(0,0,0,0.8)",
        color: "#4ade80",
        fontFamily: "monospace",
        fontSize: 10,
        lineHeight: 1.4,
        padding: "5px 9px",
        borderRadius: 6,
        pointerEvents: "none",
        whiteSpace: "pre",
      }}
    >
      {lines.join("\n")}
    </div>
  );
}
