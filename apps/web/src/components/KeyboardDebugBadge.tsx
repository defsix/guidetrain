import { useEffect, useState } from "react";

/**
 * TEMPORARY — remove once the keyboard fix is confirmed across every text
 * entry point in the app.
 *
 * Trimmed down from its earlier, two-line raw-diagnostic form: on-device
 * confirmation (v1.26/v1.27) already proved the native measurement itself
 * is correct (kb=397px with the keyboard genuinely open, vs. a correctly-
 * excluded ~37px nav-bar gap when it's closed), so --debug-layout-passes/
 * --debug-root-h/--debug-frame-bottom had done their job. What's left to
 * verify is only whether the on-page fix reacts correctly to that number
 * everywhere it's needed — one short line is enough for that, and small
 * enough not to sit on top of real content the way the fuller version did
 * (reported directly: it was covering the Progress panel's own Squat/
 * Bench/Deadlift fields, which happen to render in the same corner).
 */
export default function KeyboardDebugBadge() {
  const [kb, setKb] = useState("");

  useEffect(() => {
    const tick = () => {
      const raw = getComputedStyle(document.documentElement)
        .getPropertyValue("--keyboard-height")
        .trim();
      setKb(raw || "0px");
    };
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, []);

  return (
    <div
      style={{
        position: "fixed",
        top: "calc(var(--safe-area-top, 0px) + 2px)",
        left: 2,
        zIndex: 999999,
        background: "rgba(0,0,0,0.55)",
        color: "#4ade80",
        fontFamily: "monospace",
        fontSize: 9,
        lineHeight: 1,
        padding: "2px 5px",
        borderRadius: 4,
        pointerEvents: "none",
        whiteSpace: "pre",
      }}
    >
      kb={kb}
    </div>
  );
}
